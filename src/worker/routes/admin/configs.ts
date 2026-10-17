import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import {
  createAdminChannelRepository,
  createAdminConfigRepository,
} from "../../db/repositories/admin";
import { getEncryptionKey, nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  apiFormat,
  optionalBoolean,
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
  const hostHeader = optionalString(body, "hostHeader");
  if (hostHeader && (hostHeader.length > 255 || /[:/]/.test(hostHeader))) {
    throw new AdminValidationError("直连 Host 只能是域名，不能包含端口或路径");
  }

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

export const adminConfigRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminConfigRepository(c.env.DB).list()))
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
