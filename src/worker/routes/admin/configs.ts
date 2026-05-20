import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import { createAdminConfigRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
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
      await repository.update(
        c.req.param("id"),
        baseConfigPayload(await readJsonObject(c.req.raw))
      );
      const record = (await repository.list()).find(
        (item) => item.id === c.req.param("id")
      );
      return c.json(record ?? null);
    } catch (error) {
      return routeError(c, error);
    }
  })
  .delete("/:id", async (c) => {
    await createAdminConfigRepository(c.env.DB).delete(c.req.param("id"));
    return c.json({ ok: true });
  })
  .post("/:id/secret", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      await createAdminConfigRepository(c.env.DB).replaceSecret(
        c.req.param("id"),
        await encryptProviderKey(
          requiredString(body, "apiKey", "API Key"),
          getEncryptionKey(c.env)
        ),
        nowMs()
      );
      return c.json({ ok: true, hasApiKey: true });
    } catch (error) {
      return routeError(c, error);
    }
  });
