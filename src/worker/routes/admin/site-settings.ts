import { Hono } from "hono";

import { createAdminSiteSettingsRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminValidationError,
  optionalHttpOrigin,
  optionalHttpUrl,
  optionalString,
  readJsonObject,
  requiredInteger,
  requiredString,
} from "./validation";

function assertRange(value: number, min: number, max: number, label: string) {
  if (value < min || value > max) {
    throw new AdminValidationError(`${label}必须在 ${min} 到 ${max} 秒之间`);
  }
}

function siteSettingsPayload(body: Record<string, unknown>, now = nowMs()) {
  const defaultCheckIntervalSeconds = requiredInteger(
    body,
    "defaultCheckIntervalSeconds",
    "默认检查频次"
  );
  const notificationCooldownSeconds = requiredInteger(
    body,
    "notificationCooldownSeconds",
    "通知冷却时间"
  );
  assertRange(defaultCheckIntervalSeconds, 15, 3600, "默认检查频次");
  assertRange(notificationCooldownSeconds, 60, 86400, "通知冷却时间");

  return {
    siteName: requiredString(body, "siteName", "站点名称"),
    statusTitle: requiredString(body, "statusTitle", "状态页标题"),
    description: optionalString(body, "description"),
    logoUrl: optionalHttpUrl(body, "logoUrl", "Logo URL"),
    faviconUrl: optionalHttpUrl(body, "faviconUrl", "Favicon URL"),
    publicOrigin: optionalHttpOrigin(body, "publicOrigin", "公开域名"),
    defaultCheckIntervalSeconds,
    notificationCooldownSeconds,
    nowMs: now,
  };
}

export const adminSiteSettingsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json(await createAdminSiteSettingsRepository(c.env.DB).get())
  )
  .put("/", async (c) => {
    try {
      const repository = createAdminSiteSettingsRepository(c.env.DB);
      const record = await repository.update(
        siteSettingsPayload(await readJsonObject(c.req.raw))
      );
      return c.json(record);
    } catch (error) {
      return routeError(c, error);
    }
  });
