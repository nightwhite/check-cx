import { Hono } from "hono";

import { createLoginGuard, getClientIp } from "./login-guard";
import {
  createAdminSessionCookie,
  expireAdminSessionCookie,
  hasValidAdminSession,
  isAdminConfigured,
  isAdminTokenValid,
} from "./session";
import { getTurnstileConfig, verifyTurnstileToken } from "./turnstile";

interface LoginBody {
  token: unknown;
  turnstileToken: unknown;
}

async function readLoginBody(request: Request): Promise<LoginBody> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return { token: null, turnstileToken: null };
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { token: null, turnstileToken: null };
  }

  const record = body as { token?: unknown; turnstileToken?: unknown };
  return { token: record.token, turnstileToken: record.turnstileToken };
}

function tooManyAttempts(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({ error: "too_many_attempts", retryAfterSeconds }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export const adminAuthRoutes = new Hono<{ Bindings: Env }>()
  .post("/session", async (c) => {
    if (!isAdminConfigured(c.env)) {
      return c.json({ error: "admin_unavailable" }, 503);
    }

    const ip = getClientIp(c.req.raw);
    const guard = createLoginGuard(c.env.DB);
    const lock = await guard.checkLocked(ip);
    if (lock.locked) {
      return tooManyAttempts(lock.retryAfterSeconds);
    }

    const body = await readLoginBody(c.req.raw);
    const turnstile = getTurnstileConfig(c.env);
    if (
      turnstile &&
      !(await verifyTurnstileToken(turnstile.secretKey, body.turnstileToken, ip))
    ) {
      return c.json({ error: "captcha_failed" }, 400);
    }

    const authorized = await isAdminTokenValid(c.env, body.token);
    if (!authorized) {
      const failure = await guard.recordFailure(ip);
      if (failure.locked) {
        return tooManyAttempts(failure.retryAfterSeconds);
      }
      return c.json(
        { error: "unauthorized", remainingAttempts: failure.remainingAttempts },
        401
      );
    }

    await guard.clear(ip);
    await createAdminSessionCookie(c);
    return c.json({ ok: true, authenticated: true });
  })
  .get("/session", async (c) => {
    if (!isAdminConfigured(c.env)) {
      return c.json({ error: "admin_unavailable" }, 503);
    }

    return c.json({
      authenticated: await hasValidAdminSession(c),
      turnstileSiteKey: getTurnstileConfig(c.env)?.siteKey ?? null,
    });
  })
  .post("/logout", (c) => {
    expireAdminSessionCookie(c);
    return c.json({ ok: true });
  });
