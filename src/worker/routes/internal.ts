import { Hono } from "hono";

export const internalRoutes = new Hono<{ Bindings: Env }>().get(
  "/db-health",
  async (c) => {
    const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return c.json({ ok: result?.ok === 1 });
  }
);
