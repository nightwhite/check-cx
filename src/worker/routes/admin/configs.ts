import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import { createAdminConfigRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
  optionalBoolean,
  optionalString,
  providerType,
  readJsonObject,
  requiredString,
} from "./validation";

function baseConfigPayload(body: Record<string, unknown>, now = nowMs()) {
  return {
    name: requiredString(body, "name", "配置名称"),
    type: providerType(requiredString(body, "type", "Provider 类型")),
    modelId: requiredString(body, "modelId", "模型 ID"),
    endpoint: requiredString(body, "endpoint", "API 端点"),
    enabled: optionalBoolean(body, "enabled", true),
    isMaintenance: optionalBoolean(body, "isMaintenance", false),
    groupName: optionalString(body, "groupName"),
    nowMs: now,
  };
}

function getEncryptionKey(env: Env): string {
  const value = env.CONFIG_ENCRYPTION_KEY;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required");
  }
  return value;
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
}

export const adminConfigRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminConfigRepository(c.env.DB).list()))
  .post("/", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const repository = createAdminConfigRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...baseConfigPayload(body),
        encryptedKey: await encryptProviderKey(
          requiredString(body, "apiKey", "API Key"),
          getEncryptionKey(c.env)
        ),
      };
      await validateConfigModelType(repository, input);
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
      if (!(await repository.exists(c.req.param("id")))) {
        throw new AdminNotFoundError("配置不存在");
      }
      await validateConfigModelType(repository, input);
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
  });
