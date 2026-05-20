import { Hono } from "hono";

import { createAdminTemplateRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminNotFoundError,
  optionalJsonRecord,
  providerType,
  readJsonObject,
  requiredString,
} from "./validation";

function templatePayload(body: Record<string, unknown>, now = nowMs()) {
  return {
    name: requiredString(body, "name", "模板名称"),
    type: providerType(requiredString(body, "type", "Provider 类型")),
    requestHeader: optionalJsonRecord(body, "requestHeader"),
    metadata: optionalJsonRecord(body, "metadata"),
    nowMs: now,
  };
}

export const adminTemplateRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminTemplateRepository(c.env.DB).list()))
  .post("/", async (c) => {
    try {
      const repository = createAdminTemplateRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...templatePayload(await readJsonObject(c.req.raw)),
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
      const repository = createAdminTemplateRepository(c.env.DB);
      const updated = await repository.update(
        c.req.param("id"),
        templatePayload(await readJsonObject(c.req.raw))
      );
      if (!updated) {
        throw new AdminNotFoundError("请求模板不存在");
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
      const deleted = await createAdminTemplateRepository(c.env.DB).delete(
        c.req.param("id")
      );
      if (!deleted) {
        throw new AdminNotFoundError("请求模板不存在");
      }
      return c.json({ ok: true });
    } catch (error) {
      return routeError(c, error);
    }
  });
