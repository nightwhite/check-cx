import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";

class FakeD1 {
  prepare() {
    throw new Error("auth routes should not query D1");
  }
}

function createEnv(adminToken?: string) {
  return {
    ADMIN_TOKEN: adminToken,
    DB: new FakeD1(),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
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
    createEnv(adminToken)
  );

  return {
    app,
    response,
    cookie: response.headers.get("Set-Cookie") ?? "",
  };
}

describe("admin auth routes", () => {
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
      createEnv("secret-admin-token")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
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
      createEnv()
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
      createEnv("secret-admin-token")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
    });
  });

  it("logs out by expiring the session cookie", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/logout",
      { method: "POST" },
      createEnv("secret-admin-token")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("check_cx_admin_session=");
    expect(cookie).toContain("Max-Age=0");
  });
});
