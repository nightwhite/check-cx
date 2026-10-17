import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import { createAdminChannelRepository } from "../../db/repositories/admin";
import { getEncryptionKey, nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  optionalBoolean,
  optionalHttpUrl,
  optionalString,
  readJsonObject,
  requiredInteger,
  requiredString,
} from "./validation";

function optionalBaseUrl(body: Record<string, unknown>) {
  const value = optionalHttpUrl(body, "baseUrl", "API Base URL");
  return value ? value.replace(/\/+$/g, "") : null;
}

async function channelPayload(
  env: Env,
  body: Record<string, unknown>,
  now = nowMs()
) {
  const apiKey = optionalString(body, "apiKey");
  return {
    name: requiredString(body, "name", "渠道名称"),
    logoUrl: optionalHttpUrl(body, "logoUrl", "Logo URL"),
    websiteUrl: optionalHttpUrl(body, "websiteUrl", "官网链接"),
    statusPageUrl: optionalHttpUrl(body, "statusPageUrl", "官方状态页链接"),
    baseUrl: optionalBaseUrl(body),
    encryptedKey: apiKey
      ? await encryptProviderKey(apiKey, getEncryptionKey(env))
      : null,
    clearApiKey: optionalBoolean(body, "clearApiKey", false),
    sortOrder: requiredInteger(body, "sortOrder", "排序"),
    enabled: optionalBoolean(body, "enabled", true),
    nowMs: now,
  };
}

async function assertChannelCredentialsStillUsable(
  repository: ReturnType<typeof createAdminChannelRepository>,
  id: string,
  input: Awaited<ReturnType<typeof channelPayload>>
) {
  if (
    !input.baseUrl &&
    (await repository.configsRequiringChannelBaseUrl(id)) > 0
  ) {
    throw new AdminConflictError(
      "仍有监控项继承该渠道的 Base URL，无法清空"
    );
  }
  if (
    !input.encryptedKey &&
    input.clearApiKey &&
    (await repository.configsRequiringChannelKey(id)) > 0
  ) {
    throw new AdminConflictError("仍有监控项继承该渠道的 API Key，无法清除");
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint");
}

export const adminChannelRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminChannelRepository(c.env.DB).list()))
  .post("/", async (c) => {
    try {
      const repository = createAdminChannelRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...(await channelPayload(c.env, await readJsonObject(c.req.raw))),
      };
      await repository.create(input);
      const record = (await repository.list()).find((item) => item.id === input.id);
      return c.json(record, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return routeError(c, new AdminConflictError("渠道名称已存在"));
      }
      return routeError(c, error);
    }
  })
  .put("/:id", async (c) => {
    try {
      const repository = createAdminChannelRepository(c.env.DB);
      const input = await channelPayload(
        c.env,
        await readJsonObject(c.req.raw)
      );
      await assertChannelCredentialsStillUsable(
        repository,
        c.req.param("id"),
        input
      );
      const updated = await repository.update(c.req.param("id"), input);
      if (!updated) {
        throw new AdminNotFoundError("渠道不存在");
      }
      const record = (await repository.list()).find(
        (item) => item.id === c.req.param("id")
      );
      return c.json(record ?? null);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return routeError(c, new AdminConflictError("渠道名称已存在"));
      }
      return routeError(c, error);
    }
  })
  .delete("/:id", async (c) => {
    try {
      const repository = createAdminChannelRepository(c.env.DB);
      if (await repository.usedByConfigs(c.req.param("id"))) {
        throw new AdminConflictError("渠道仍被监控项引用，无法删除");
      }
      const deleted = await repository.delete(c.req.param("id"));
      if (!deleted) {
        throw new AdminNotFoundError("渠道不存在");
      }
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof AdminValidationError) {
        return routeError(c, error);
      }
      return routeError(c, error);
    }
  });
