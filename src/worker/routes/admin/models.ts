import { Hono } from "hono";

import { createAdminModelRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
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

async function validateTemplateType(
  repository: ReturnType<typeof createAdminModelRepository>,
  input: ReturnType<typeof modelPayload>
) {
  if (!input.templateId) {
    return;
  }

  const template = await repository.findTemplateType(input.templateId);
  if (!template) {
    throw new AdminNotFoundError("请求模板不存在");
  }
  if (template.type !== input.type) {
    throw new AdminConflictError("模型类型必须与请求模板类型一致");
  }
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
      await validateTemplateType(repository, input);
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
      const input = modelPayload(await readJsonObject(c.req.raw));
      await validateTemplateType(repository, input);
      const updated = await repository.update(
        c.req.param("id"),
        input
      );
      if (!updated) {
        throw new AdminNotFoundError("模型不存在");
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
    await createAdminModelRepository(c.env.DB).delete(c.req.param("id"));
    return c.json({ ok: true });
  });
