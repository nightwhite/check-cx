import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import { createAdminRouteEnv } from "./admin-route-test-helpers";

async function createEnv(adminToken?: string, extra: Partial<Env> = {}) {
  return {
    ...(await createAdminRouteEnv()),
    ADMIN_TOKEN: adminToken,
    ...extra,
  } as Env;
}

function loginRequest(
  token: string,
  ip = "203.0.113.10",
  extraBody: Record<string, unknown> = {}
) {
  return {
    method: "POST",
    body: JSON.stringify({ token, ...extraBody }),
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    },
  };
}

async function login(adminToken = "secret-admin-token") {
  const app = createWorkerApp();
  const response = await app.request(
    "http://example.com/api/admin/session",
    {
      method: "POST",
      body: JSON.stringify({ token: adminToken }),
      headers: { "Content-Type": "application/json" },
    },
    await createEnv(adminToken)
  );

  return {
    app,
    response,
    cookie: response.headers.get("Set-Cookie") ?? "",
  };
}

describe("admin auth routes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("logs in with ADMIN_TOKEN and sets a 30-day HttpOnly cookie", async () => {
    const { response, cookie } = await login();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      authenticated: true,
    });
    expect(cookie).toContain("check_cx_admin_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("rejects an invalid admin token", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/session",
      {
        method: "POST",
        body: JSON.stringify({ token: "wrong-token" }),
        headers: { "Content-Type": "application/json" },
      },
      await createEnv("secret-admin-token")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      remainingAttempts: 4,
    });
  });

  it("returns 503 when ADMIN_TOKEN is missing", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/session",
      {
        method: "POST",
        body: JSON.stringify({ token: "anything" }),
        headers: { "Content-Type": "application/json" },
      },
      await createEnv()
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "admin_unavailable",
    });
  });

  it("returns the current session for a valid cookie", async () => {
    const { app, cookie } = await login();

    const response = await app.request(
      "http://example.com/api/admin/session",
      { headers: { Cookie: cookie } },
      await createEnv("secret-admin-token")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
    });
  });

  it("treats malformed session cookies as unauthenticated", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/summary",
      { headers: { Cookie: "check_cx_admin_session=payload.@@@" } },
      await createEnv("secret-admin-token")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("logs out by expiring the session cookie", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/logout",
      { method: "POST" },
      await createEnv("secret-admin-token")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("check_cx_admin_session=");
    expect(cookie).toContain("Max-Age=0");
  });

  it("locks an IP after 5 failures without checking the token", async () => {
    const app = createWorkerApp();
    const env = await createEnv("secret-admin-token");

    const remaining: unknown[] = [];
    for (let index = 0; index < 4; index++) {
      const response = await app.request(
        "http://example.com/api/admin/session",
        loginRequest("wrong-token"),
        env
      );
      expect(response.status).toBe(401);
      remaining.push(((await response.json()) as { remainingAttempts: number }).remainingAttempts);
    }
    expect(remaining).toEqual([4, 3, 2, 1]);

    const lockedResponse = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("wrong-token"),
      env
    );
    expect(lockedResponse.status).toBe(429);
    expect(lockedResponse.headers.get("Retry-After")).toBe("900");
    await expect(lockedResponse.json()).resolves.toEqual({
      error: "too_many_attempts",
      retryAfterSeconds: 900,
    });

    const correctWhileLocked = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token"),
      env
    );
    expect(correctWhileLocked.status).toBe(429);
    expect(correctWhileLocked.headers.get("Set-Cookie")).toBeNull();

    const otherIp = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token", "198.51.100.7"),
      env
    );
    expect(otherIp.status).toBe(200);
  });

  it("doubles the lock duration on repeated lockouts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-17T00:00:00.000Z"));
    const app = createWorkerApp();
    const env = await createEnv("secret-admin-token");

    async function failFiveTimes() {
      let response: Response | null = null;
      for (let index = 0; index < 5; index++) {
        response = await app.request(
          "http://example.com/api/admin/session",
          loginRequest("wrong-token"),
          env
        );
      }
      return response as Response;
    }

    expect((await failFiveTimes()).headers.get("Retry-After")).toBe("900");
    vi.advanceTimersByTime(15 * 60_000 + 1);
    expect((await failFiveTimes()).headers.get("Retry-After")).toBe("1800");
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect((await failFiveTimes()).headers.get("Retry-After")).toBe("3600");
  });

  it("clears IP failures after a successful login", async () => {
    const app = createWorkerApp();
    const env = await createEnv("secret-admin-token");

    for (let index = 0; index < 3; index++) {
      await app.request(
        "http://example.com/api/admin/session",
        loginRequest("wrong-token"),
        env
      );
    }
    const success = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token"),
      env
    );
    expect(success.status).toBe(200);

    const afterSuccess = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("wrong-token"),
      env
    );
    await expect(afterSuccess.json()).resolves.toMatchObject({
      remainingAttempts: 4,
    });
  });

  it("pauses all logins after too many failures across IPs", async () => {
    const app = createWorkerApp();
    const env = await createEnv("secret-admin-token");

    let lastResponse: Response | null = null;
    for (let index = 0; index < 30; index++) {
      lastResponse = await app.request(
        "http://example.com/api/admin/session",
        loginRequest("wrong-token", `10.0.0.${index}`),
        env
      );
    }
    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers.get("Retry-After")).toBe("60");

    const freshIp = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token", "192.0.2.1"),
      env
    );
    expect(freshIp.status).toBe(429);
  });

  it("exposes the Turnstile site key only when fully configured", async () => {
    const app = createWorkerApp();

    const disabled = await app.request(
      "http://example.com/api/admin/session",
      {},
      await createEnv("secret-admin-token", { TURNSTILE_SITE_KEY: "site-key" })
    );
    await expect(disabled.json()).resolves.toEqual({
      authenticated: false,
      turnstileSiteKey: null,
    });

    const blank = await app.request(
      "http://example.com/api/admin/session",
      {},
      await createEnv("secret-admin-token", {
        TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "  ",
      })
    );
    await expect(blank.json()).resolves.toEqual({
      authenticated: false,
      turnstileSiteKey: null,
    });

    const enabled = await app.request(
      "http://example.com/api/admin/session",
      {},
      await createEnv("secret-admin-token", {
        TURNSTILE_SITE_KEY: "site-key",
        TURNSTILE_SECRET_KEY: "secret-key",
      })
    );
    await expect(enabled.json()).resolves.toEqual({
      authenticated: false,
      turnstileSiteKey: "site-key",
    });
  });

  it("verifies Turnstile tokens and does not count captcha failures", async () => {
    const siteverify = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      return new Response(
        JSON.stringify({ success: body.get("response") === "good-captcha" }),
        { headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", siteverify);
    const app = createWorkerApp();
    const env = await createEnv("secret-admin-token", {
      TURNSTILE_SITE_KEY: "site-key",
      TURNSTILE_SECRET_KEY: "secret-key",
    });

    for (let index = 0; index < 6; index++) {
      const response = await app.request(
        "http://example.com/api/admin/session",
        loginRequest("wrong-token", "203.0.113.10", {
          turnstileToken: "bad-captcha",
        }),
        env
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "captcha_failed" });
    }

    const missing = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token"),
      env
    );
    expect(missing.status).toBe(400);

    const wrongToken = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("wrong-token", "203.0.113.10", {
        turnstileToken: "good-captcha",
      }),
      env
    );
    expect(wrongToken.status).toBe(401);
    await expect(wrongToken.json()).resolves.toMatchObject({
      remainingAttempts: 4,
    });

    const success = await app.request(
      "http://example.com/api/admin/session",
      loginRequest("secret-admin-token", "203.0.113.10", {
        turnstileToken: "good-captcha",
      }),
      env
    );
    expect(success.status).toBe(200);

    const [url, init] = siteverify.mock.calls.at(-1) ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("secret")).toBe("secret-key");
    expect(body.get("remoteip")).toBe("203.0.113.10");
  });
});
