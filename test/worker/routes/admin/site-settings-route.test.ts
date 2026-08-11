import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createAdminRouteEnv,
  jsonRequest,
  loginAdmin,
} from "./admin-route-test-helpers";

async function setup() {
  const app = createWorkerApp();
  const env = await createAdminRouteEnv();
  const cookie = await loginAdmin(app, env);
  return { app, env, cookie };
}

describe("admin site settings route", () => {
  it("returns the single site settings record", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/site-settings",
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "default",
      siteName: "Check CX",
      statusTitle: "AI Model Status",
      description: null,
      logoUrl: null,
      faviconUrl: null,
      publicOrigin: null,
      defaultCheckIntervalSeconds: 60,
      notificationCooldownSeconds: 300,
    });
  });

  it("updates site name, logo url, public origin and default interval", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/site-settings",
      jsonRequest("PUT", cookie, {
        siteName: "Model Status",
        statusTitle: "Production AI Status",
        description: "Status for production AI channels",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: "https://example.com/favicon.ico",
        publicOrigin: "https://status.example.com",
        defaultCheckIntervalSeconds: 120,
        notificationCooldownSeconds: 300,
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "default",
      siteName: "Model Status",
      statusTitle: "Production AI Status",
      description: "Status for production AI channels",
      logoUrl: "https://example.com/logo.png",
      faviconUrl: "https://example.com/favicon.ico",
      publicOrigin: "https://status.example.com",
      defaultCheckIntervalSeconds: 120,
      notificationCooldownSeconds: 300,
    });
  });

  it("rejects invalid logo and public origin urls", async () => {
    const { app, env, cookie } = await setup();

    const invalidLogo = await app.request(
      "http://example.com/api/admin/site-settings",
      jsonRequest("PUT", cookie, {
        siteName: "Model Status",
        statusTitle: "Production AI Status",
        logoUrl: "javascript:alert(1)",
        faviconUrl: null,
        publicOrigin: "https://status.example.com",
        defaultCheckIntervalSeconds: 60,
        notificationCooldownSeconds: 300,
      }),
      env
    );
    expect(invalidLogo.status).toBe(400);

    const invalidFavicon = await app.request(
      "http://example.com/api/admin/site-settings",
      jsonRequest("PUT", cookie, {
        siteName: "Model Status",
        statusTitle: "Production AI Status",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: "javascript:alert(1)",
        publicOrigin: "https://status.example.com",
        defaultCheckIntervalSeconds: 60,
        notificationCooldownSeconds: 300,
      }),
      env
    );
    expect(invalidFavicon.status).toBe(400);

    const invalidOrigin = await app.request(
      "http://example.com/api/admin/site-settings",
      jsonRequest("PUT", cookie, {
        siteName: "Model Status",
        statusTitle: "Production AI Status",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: "https://example.com/favicon.ico",
        publicOrigin: "https://status.example.com/path",
        defaultCheckIntervalSeconds: 60,
        notificationCooldownSeconds: 300,
      }),
      env
    );
    expect(invalidOrigin.status).toBe(400);
  });

  it("rejects default intervals outside 15 to 3600 seconds", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/site-settings",
      jsonRequest("PUT", cookie, {
        siteName: "Model Status",
        statusTitle: "Production AI Status",
        logoUrl: null,
        faviconUrl: null,
        publicOrigin: null,
        defaultCheckIntervalSeconds: 10,
        notificationCooldownSeconds: 300,
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "默认检查频次必须在 15 到 3600 秒之间",
    });
  });
});
