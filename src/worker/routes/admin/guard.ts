import type { MiddlewareHandler } from "hono";

import { hasValidAdminSession, isAdminConfigured } from "./session";

export const requireAdminSession: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  if (!isAdminConfigured(c.env)) {
    return c.json({ error: "admin_unavailable" }, 503);
  }

  if (!(await hasValidAdminSession(c))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
};
