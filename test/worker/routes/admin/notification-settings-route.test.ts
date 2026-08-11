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

describe("admin notification settings route", () => {
  it("returns notification settings without webhook material", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/notification-settings",
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "default",
      enabled: false,
      hasWebhookUrl: false,
      notifyDegraded: true,
      notifyFailed: true,
      notifyRecovered: true,
      createdAtMs: expect.any(Number),
      updatedAtMs: expect.any(Number),
    });
  });

  it("updates encrypted webhook settings without returning plaintext", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/notification-settings",
      jsonRequest("PUT", cookie, {
        enabled: true,
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test",
        notifyDegraded: true,
        notifyFailed: true,
        notifyRecovered: true,
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      enabled: true,
      hasWebhookUrl: true,
      notifyDegraded: true,
      notifyFailed: true,
      notifyRecovered: true,
    });
    expect(JSON.stringify(body)).not.toContain("open.feishu.cn");
  });
});
