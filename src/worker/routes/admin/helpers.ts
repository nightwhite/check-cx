import type { Context } from "hono";

import { AdminUnavailableError, isAdminRouteError } from "./validation";

export type AdminRouteContext = Context<{ Bindings: Env }>;

export function routeError(c: AdminRouteContext, error: unknown) {
  if (isAdminRouteError(error)) {
    return c.json({ error: error.message }, error.status as 400 | 404 | 409 | 503);
  }

  throw error;
}

export function nowMs() {
  return Date.now();
}

export function getEncryptionKey(env: Env): string {
  const value = env.CONFIG_ENCRYPTION_KEY;
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminUnavailableError("配置加密密钥未配置");
  }
  return value;
}
