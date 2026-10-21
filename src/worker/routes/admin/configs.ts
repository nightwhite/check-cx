import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import {
  createAdminChannelRepository,
  createAdminConfigRepository,
} from "../../db/repositories/admin";
import { getEncryptionKey, nowMs, routeError } from "./helpers";
import type { BulkConfigPatch } from "../../db/repositories/admin";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  apiFormat,
  bulkIds,
  optionalBoolean,
  optionalHostHeader,
  optionalInteger,
  optionalString,
  providerType,
  readJsonObject,
  requiredString,
} from "./validation";

function baseConfigPayload(body: Record<string, unknown>, now = nowMs()) {
  const checkIntervalSeconds = optionalInteger(
    body,
    "checkIntervalSeconds",
    "检查频次覆盖"
  );
  if (
    checkIntervalSeconds !== null &&
    (checkIntervalSeconds < 15 || checkIntervalSeconds > 3600)
  ) {
    throw new AdminValidationError("检查频次覆盖必须在 15 到 3600 秒之间");
  }
  const region = optionalString(body, "region");
  if (region && region.length > 80) {
    throw new AdminValidationError("Region / 备注不能超过 80 个字符");
  }
  const hostHeader = optionalHostHeader(body, "hostHeader");

  return {
    name: requiredString(body, "name", "配置名称"),
    type: providerType(requiredString(body, "type", "Provider 类型")),
    modelId: requiredString(body, "modelId", "模型 ID"),
    channelId: requiredString(body, "channelId", "渠道 ID"),
    // 端点留空表示继承渠道 Base URL，按 API 格式自动拼接。
    endpoint: optionalString(body, "endpoint") ?? "",
    hostHeader,
    apiFormat: apiFormat(optionalString(body, "apiFormat") ?? "chat_completions"),
    enabled: optionalBoolean(body, "enabled", true),
    isMaintenance: optionalBoolean(body, "isMaintenance", false),
    groupName: null,
    checkIntervalSeconds,
    region,
    nowMs: now,
  };
}

async function validateConfigModelType(
  repository: ReturnType<typeof createAdminConfigRepository>,
  input: ReturnType<typeof baseConfigPayload>
) {
  const model = await repository.findModelType(input.modelId);
  if (!model) {
    throw new AdminNotFoundError("模型不存在");
  }
  if (model.type !== input.type) {
    throw new AdminConflictError("配置类型必须与模型类型一致");
  }
  if (!(await repository.channelExists(input.channelId))) {
    throw new AdminNotFoundError("渠道不存在");
  }
}

// 校验监控项最终能解析出端点与 Key：自身留空时渠道必须提供对应信息。
async function validateInheritedCredentials(
  env: Env,
  input: {
    channelId: string;
    endpoint: string;
    isMaintenance: boolean;
    hasOwnKey: boolean;
  }
) {
  const channel = await createAdminChannelRepository(env.DB).findCredentials(
    input.channelId
  );
  if (!channel) {
    throw new AdminNotFoundError("渠道不存在");
  }
  if (!input.endpoint && !channel.baseUrl) {
    throw new AdminConflictError(
      "渠道未配置 Base URL，请填写 API 端点或先完善渠道"
    );
  }
  if (!input.hasOwnKey && !channel.hasApiKey && !input.isMaintenance) {
    throw new AdminConflictError(
      "渠道未配置 API Key，请填写 API Key 或先完善渠道"
    );
  }
}

function bulkPatch(body: Record<string, unknown>): BulkConfigPatch {
  const raw = body.patch;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AdminValidationError("请选择要修改的字段");
  }
  const input = raw as Record<string, unknown>;
  const patch: BulkConfigPatch = {};
  if ("enabled" in input) {
    patch.enabled = optionalBoolean(input, "enabled", true);
  }
  if ("isMaintenance" in input) {
    patch.isMaintenance = optionalBoolean(input, "isMaintenance", false);
  }
  if ("channelId" in input) {
    patch.channelId = requiredString(input, "channelId", "渠道");
  }
  if ("apiFormat" in input) {
    patch.apiFormat = apiFormat(requiredString(input, "apiFormat", "API 格式"));
  }
  if ("checkIntervalSeconds" in input) {
    // null 表示恢复使用站点默认频次
    const value = optionalInteger(input, "checkIntervalSeconds", "检查频次覆盖");
    if (value !== null && (value < 15 || value > 3600)) {
      throw new AdminValidationError("检查频次覆盖必须在 15 到 3600 秒之间");
    }
    patch.checkIntervalSeconds = value;
  }
  if (Object.keys(patch).length === 0) {
    throw new AdminValidationError("请选择要修改的字段");
  }
  return patch;
}

// 改渠道后若监控项端点或 Key 依赖继承，目标渠道必须能提供对应信息
async function validateBulkChannelMove(
  env: Env,
  ids: string[],
  channelId: string
) {
  const channel = await createAdminChannelRepository(env.DB).findCredentials(
    channelId
  );
  if (!channel) {
    throw new AdminNotFoundError("渠道不存在");
  }
  const records = (await createAdminConfigRepository(env.DB).list()).filter(
    (record) => ids.includes(record.id)
  );
  const blocked = records.filter(
    (record) =>
      (record.inheritsEndpoint && !channel.baseUrl) ||
      (!record.hasApiKey && !channel.hasApiKey && !record.isMaintenance)
  );
  if (blocked.length > 0) {
    throw new AdminConflictError(
      `目标渠道缺少 Base URL 或 API Key，无法接收：${blocked
        .slice(0, 5)
        .map((record) => record.name)
        .join("、")}${blocked.length > 5 ? ` 等 ${blocked.length} 项` : ""}`
    );
  }
}

export const adminConfigRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminConfigRepository(c.env.DB).list()))
  .post("/bulk/update", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const ids = bulkIds(body);
      const patch = bulkPatch(body);
      if (patch.channelId) {
        await validateBulkChannelMove(c.env, ids, patch.channelId);
      }
      const updated = await createAdminConfigRepository(c.env.DB).bulkUpdate(
        ids,
        patch,
        nowMs()
      );
      return c.json({ updated });
    } catch (error) {
      return routeError(c, error);
    }
  })
  .post("/bulk/delete", async (c) => {
    try {
      const ids = bulkIds(await readJsonObject(c.req.raw));
      const deleted = await createAdminConfigRepository(c.env.DB).bulkDelete(ids);
      return c.json({ deleted });
    } catch (error) {
      return routeError(c, error);
    }
  })
  .post("/bulk/copy", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const ids = bulkIds(body);
      const channelId = requiredString(body, "channelId", "目标渠道");
      const channel = await createAdminChannelRepository(c.env.DB).findCredentials(
        channelId
      );
      if (!channel) {
        throw new AdminNotFoundError("渠道不存在");
      }
      if (!channel.baseUrl || !channel.hasApiKey) {
        throw new AdminConflictError(
          "目标渠道需同时配置 Base URL 与 API Key，复制的监控项会继承它们"
        );
      }
      const result = await createAdminConfigRepository(c.env.DB).copyToChannel(
        ids,
        channelId,
        nowMs()
      );
      return c.json(result, 201);
    } catch (error) {
      return routeError(c, error);
    }
  })
  .post("/", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const repository = createAdminConfigRepository(c.env.DB);
      const apiKey = optionalString(body, "apiKey");
      const input = {
        id: crypto.randomUUID(),
        ...baseConfigPayload(body),
        encryptedKey: apiKey
          ? await encryptProviderKey(apiKey, getEncryptionKey(c.env))
          : null,
      };
      await validateConfigModelType(repository, input);
      await validateInheritedCredentials(c.env, {
        ...input,
        hasOwnKey: Boolean(input.encryptedKey),
      });
      await repository.create(input);
      const record = (await repository.list()).find((item) => item.id === input.id);
      return c.json(record, 201);
    } catch (error) {
      return routeError(c, error);
    }
  })
  .patch("/:id", async (c) => {
    try {
      const repository = createAdminConfigRepository(c.env.DB);
      const input = baseConfigPayload(await readJsonObject(c.req.raw));
      const existing = await repository.findCredentials(c.req.param("id"));
      if (!existing) {
        throw new AdminNotFoundError("配置不存在");
      }
      await validateConfigModelType(repository, input);
      await validateInheritedCredentials(c.env, {
        ...input,
        hasOwnKey: existing.hasApiKey,
      });
      const updated = await repository.update(
        c.req.param("id"),
        input
      );
      if (!updated) {
        throw new AdminNotFoundError("配置不存在");
      }
      const record = (await repository.list()).find(
        (item) => item.id === c.req.param("id")
      );
      return c.json(record ?? null);
    } catch (error) {
      return routeError(c, error);
    }
  })
  .delete("/:id", async (c) => {
    try {
      const deleted = await createAdminConfigRepository(c.env.DB).delete(
        c.req.param("id")
      );
      if (!deleted) {
        throw new AdminNotFoundError("配置不存在");
      }
      return c.json({ ok: true });
    } catch (error) {
      return routeError(c, error);
    }
  })
  .post("/:id/secret", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const replaced = await createAdminConfigRepository(c.env.DB).replaceSecret(
        c.req.param("id"),
        await encryptProviderKey(
          requiredString(body, "apiKey", "API Key"),
          getEncryptionKey(c.env)
        ),
        nowMs()
      );
      if (!replaced) {
        throw new AdminNotFoundError("配置不存在");
      }
      return c.json({ ok: true, hasApiKey: true });
    } catch (error) {
      return routeError(c, error);
    }
  })
  .delete("/:id/secret", async (c) => {
    try {
      const repository = createAdminConfigRepository(c.env.DB);
      const record = (await repository.list()).find(
        (item) => item.id === c.req.param("id")
      );
      if (!record) {
        throw new AdminNotFoundError("配置不存在");
      }
      if (!record.channelId) {
        throw new AdminConflictError("监控项未关联渠道，无法继承渠道 Key");
      }
      await validateInheritedCredentials(c.env, {
        channelId: record.channelId,
        endpoint: record.endpoint,
        isMaintenance: record.isMaintenance,
        hasOwnKey: false,
      });
      await repository.clearSecret(record.id, nowMs());
      return c.json({ ok: true, hasApiKey: false });
    } catch (error) {
      return routeError(c, error);
    }
  });
