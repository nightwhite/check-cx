import type { Context } from "hono";

import { isAdminRouteError } from "./validation";

export type AdminRouteContext = Context<{ Bindings: Env }>;

export function routeError(c: AdminRouteContext, error: unknown) {
  if (isAdminRouteError(error)) {
    return c.json({ error: error.message }, error.status as 400 | 409);
  }

  throw error;
}

export function nowMs() {
  return Date.now();
}
