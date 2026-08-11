import { Hono } from "hono";

import { createAdminChannelRepository } from "../../db/repositories/admin";
import { nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  optionalBoolean,
  optionalHttpUrl,
  readJsonObject,
  requiredInteger,
  requiredString,
} from "./validation";

function channelPayload(body: Record<string, unknown>, now = nowMs()) {
  return {
    name: requiredString(body, "name", "渠道名称"),
    logoUrl: optionalHttpUrl(body, "logoUrl", "Logo URL"),
    websiteUrl: optionalHttpUrl(body, "websiteUrl", "官网链接"),
    statusPageUrl: optionalHttpUrl(body, "statusPageUrl", "官方状态页链接"),
    sortOrder: requiredInteger(body, "sortOrder", "排序"),
    enabled: optionalBoolean(body, "enabled", true),
    nowMs: now,
  };
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
        ...channelPayload(await readJsonObject(c.req.raw)),
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
      const updated = await repository.update(
        c.req.param("id"),
        channelPayload(await readJsonObject(c.req.raw))
      );
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
