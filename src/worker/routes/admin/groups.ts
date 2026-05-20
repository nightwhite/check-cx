import { Hono } from "hono";

import { createAdminGroupRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import { optionalString, readJsonObject, requiredString } from "./validation";

function groupPayload(body: Record<string, unknown>, now = nowMs()) {
  return {
    groupName: requiredString(body, "groupName", "分组名称"),
    websiteUrl: optionalString(body, "websiteUrl"),
    tags: optionalString(body, "tags") ?? "",
    nowMs: now,
  };
}

export const adminGroupRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await createAdminGroupRepository(c.env.DB).list()))
  .post("/", async (c) => {
    try {
      const repository = createAdminGroupRepository(c.env.DB);
      const input = {
        id: crypto.randomUUID(),
        ...groupPayload(await readJsonObject(c.req.raw)),
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
      const repository = createAdminGroupRepository(c.env.DB);
      await repository.update(
        c.req.param("id"),
        groupPayload(await readJsonObject(c.req.raw))
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
    await createAdminGroupRepository(c.env.DB).delete(c.req.param("id"));
    return c.json({ ok: true });
  });
