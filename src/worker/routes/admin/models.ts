import { Hono } from "hono";

import { createAdminModelRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  optionalString,
  providerType,
  readJsonObject,
  requiredString,
} from "./validation";

function modelPayload(body: Record<string, unknown>, now = nowMs()) {
  return {
    type: providerType(requiredString(body, "type", "Provider 类型")),
    model: requiredString(body, "model", "模型"),
    templateId: optionalString(body, "templateId"),
    nowMs: now,
  };
}

export const adminModelRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminModelRepository(c.env.DB).list()))
  .post("/", async (c) => {
    try {
      const repository = createAdminModelRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...modelPayload(await readJsonObject(c.req.raw)),
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
      const repository = createAdminModelRepository(c.env.DB);
      await repository.update(
        c.req.param("id"),
        modelPayload(await readJsonObject(c.req.raw))
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
    await createAdminModelRepository(c.env.DB).delete(c.req.param("id"));
    return c.json({ ok: true });
  });
