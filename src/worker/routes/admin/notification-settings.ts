import { Hono } from "hono";

import { encryptProviderKey } from "../../crypto/provider-key";
import { createAdminNotificationSettingsRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminUnavailableError,
  optionalBoolean,
  optionalHttpUrl,
  readJsonObject,
} from "./validation";

function getEncryptionKey(env: Env): string {
  const value = env.CONFIG_ENCRYPTION_KEY;
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminUnavailableError("配置加密密钥未配置");
  }
  return value;
}

export const adminNotificationSettingsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json(await createAdminNotificationSettingsRepository(c.env.DB).get())
  )
  .put("/", async (c) => {
    try {
      const body = await readJsonObject(c.req.raw);
      const webhookUrl = optionalHttpUrl(body, "webhookUrl", "飞书 Webhook URL");
      const encrypted = webhookUrl
        ? await encryptProviderKey(webhookUrl, getEncryptionKey(c.env))
        : null;
      const record = await createAdminNotificationSettingsRepository(
        c.env.DB
      ).update({
        larkWebhookCiphertext: encrypted?.ciphertext ?? null,
        larkWebhookNonce: encrypted?.nonce ?? null,
        enabled: optionalBoolean(body, "enabled", false),
        notifyDegraded: optionalBoolean(body, "notifyDegraded", true),
        notifyFailed: optionalBoolean(body, "notifyFailed", true),
        notifyRecovered: optionalBoolean(body, "notifyRecovered", true),
        nowMs: nowMs(),
      });
      return c.json(record);
    } catch (error) {
      return routeError(c, error);
    }
  });
