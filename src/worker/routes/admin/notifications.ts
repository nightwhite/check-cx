import { Hono } from "hono";

import { createAdminNotificationRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  notificationLevel,
  optionalBoolean,
  readJsonObject,
  requiredString,
} from "./validation";

function notificationPayload(body: Record<string, unknown>) {
  return {
    message: requiredString(body, "message", "通知内容"),
    level: notificationLevel(requiredString(body, "level", "通知级别")),
    isActive: optionalBoolean(body, "isActive", true),
  };
}

export const adminNotificationRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json(await createAdminNotificationRepository(c.env.DB).list())
  )
  .post("/", async (c) => {
    try {
      const repository = createAdminNotificationRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...notificationPayload(await readJsonObject(c.req.raw)),
        nowMs: nowMs(),
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
      const repository = createAdminNotificationRepository(c.env.DB);
      await repository.update(
        c.req.param("id"),
        notificationPayload(await readJsonObject(c.req.raw))
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
    await createAdminNotificationRepository(c.env.DB).delete(c.req.param("id"));
    return c.json({ ok: true });
  });
