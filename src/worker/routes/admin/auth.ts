import { Hono } from "hono";

import {
  createAdminSessionCookie,
  expireAdminSessionCookie,
  hasValidAdminSession,
  isAdminConfigured,
  isAdminTokenValid,
} from "./session";

async function readToken(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  return (body as { token?: unknown }).token;
}

export const adminAuthRoutes = new Hono<{ Bindings: Env }>()
  .post("/session", async (c) => {
    if (!isAdminConfigured(c.env)) {
      return c.json({ error: "admin_unavailable" }, 503);
    }

    const token = await readToken(c.req.raw);
    const authorized = await isAdminTokenValid(c.env, token);
    if (!authorized) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await createAdminSessionCookie(c);
    return c.json({ ok: true, authenticated: true });
  })
  .get("/session", async (c) => {
    if (!isAdminConfigured(c.env)) {
      return c.json({ error: "admin_unavailable" }, 503);
    }

    return c.json({ authenticated: await hasValidAdminSession(c) });
  })
  .post("/logout", (c) => {
    expireAdminSessionCookie(c);
    return c.json({ ok: true });
  });
