import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createAdminRouteEnv,
  jsonRequest,
  loginAdmin,
} from "./admin-route-test-helpers";

async function createFixture(
  app: ReturnType<typeof createWorkerApp>,
  env: Env,
  cookie: string
) {
  const channelResponse = await app.request(
    "http://example.com/api/admin/channels",
    jsonRequest("POST", cookie, {
      name: "Azure",
      logoUrl: null,
      websiteUrl: null,
      statusPageUrl: null,
      sortOrder: 1,
      enabled: true,
    }),
    env
  );
  expect(channelResponse.status).toBe(201);
  const channel = (await channelResponse.json()) as { id: string };

  const modelResponse = await app.request(
    "http://example.com/api/admin/models",
    jsonRequest("POST", cookie, {
      type: "openai",
      model: "gpt-5.4-mini",
      templateId: null,
    }),
    env
  );
  expect(modelResponse.status).toBe(201);
  const model = (await modelResponse.json()) as { id: string };

  const configResponse = await app.request(
    "http://example.com/api/admin/configs",
    jsonRequest("POST", cookie, {
      name: "gpt-5.4-mini",
      type: "openai",
      modelId: model.id,
      channelId: channel.id,
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      enabled: true,
      isMaintenance: false,
    }),
    env
  );
  expect(configResponse.status).toBe(201);
  const config = (await configResponse.json()) as { id: string };

  await env.DB.prepare(
    `INSERT INTO check_history
       (id, config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message, log_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      "log-1",
      config.id,
      "failed",
      743,
      500,
      1_700_000_000_000,
      "Provider returned HTTP 521",
      '{"error":{"code":"upstream_unavailable"}}'
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO check_history
       (id, config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message, log_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      "log-2",
      config.id,
      "operational",
      1643,
      500,
      1_700_000_060_000,
      "OK",
      "Hi! How can I help?"
    )
    .run();

  return { channel, config };
}

describe("admin logs route", () => {
  it("requires an admin session", async () => {
    const app = createWorkerApp();
    const response = await app.request(
      "http://example.com/api/admin/logs",
      {},
      await createAdminRouteEnv()
    );

    expect(response.status).toBe(401);
  });

  it("lists recent check logs newest first with filters and pagination", async () => {
    const app = createWorkerApp();
    const env = await createAdminRouteEnv();
    const cookie = await loginAdmin(app, env);
    const { channel, config } = await createFixture(app, env, cookie);

    const listResponse = await app.request(
      "http://example.com/api/admin/logs",
      { headers: { Cookie: cookie } },
      env
    );
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      total: number;
      limit: number;
      offset: number;
      logs: Array<Record<string, unknown>>;
    };
    expect(list.total).toBe(2);
    expect(list.limit).toBe(100);
    expect(list.offset).toBe(0);
    expect(list.logs).toHaveLength(2);
    expect(list.logs[0]).toMatchObject({
      id: "log-2",
      configId: config.id,
      name: "gpt-5.4-mini",
      channelId: channel.id,
      channelName: "Azure",
      model: "gpt-5.4-mini",
      status: "operational",
      message: "OK",
      logMessage: "Hi! How can I help?",
    });
    expect(list.logs[1]).toMatchObject({
      id: "log-1",
      status: "failed",
      message: "Provider returned HTTP 521",
    });

    const failedResponse = await app.request(
      "http://example.com/api/admin/logs?status=failed",
      { headers: { Cookie: cookie } },
      env
    );
    const failed = (await failedResponse.json()) as {
      total: number;
      logs: Array<{ id: string }>;
    };
    expect(failed.total).toBe(1);
    expect(failed.logs[0].id).toBe("log-1");

    const searchResponse = await app.request(
      "http://example.com/api/admin/logs?q=521",
      { headers: { Cookie: cookie } },
      env
    );
    const search = (await searchResponse.json()) as {
      total: number;
      logs: Array<{ id: string }>;
    };
    expect(search.total).toBe(1);
    expect(search.logs[0].id).toBe("log-1");

    const channelResponse = await app.request(
      `http://example.com/api/admin/logs?channelId=${channel.id}`,
      { headers: { Cookie: cookie } },
      env
    );
    const channelLogs = (await channelResponse.json()) as { total: number };
    expect(channelLogs.total).toBe(2);

    const missingChannelResponse = await app.request(
      "http://example.com/api/admin/logs?channelId=missing",
      { headers: { Cookie: cookie } },
      env
    );
    const missingChannelLogs = (await missingChannelResponse.json()) as {
      total: number;
    };
    expect(missingChannelLogs.total).toBe(0);

    const pageResponse = await app.request(
      "http://example.com/api/admin/logs?limit=1&offset=1",
      { headers: { Cookie: cookie } },
      env
    );
    const page = (await pageResponse.json()) as {
      total: number;
      limit: number;
      offset: number;
      logs: Array<{ id: string }>;
    };
    expect(page.total).toBe(2);
    expect(page.limit).toBe(1);
    expect(page.offset).toBe(1);
    expect(page.logs).toHaveLength(1);
    expect(page.logs[0].id).toBe("log-1");
  });

  it("rejects an invalid status filter", async () => {
    const app = createWorkerApp();
    const env = await createAdminRouteEnv();
    const cookie = await loginAdmin(app, env);

    const response = await app.request(
      "http://example.com/api/admin/logs?status=bogus",
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_status" });
  });
});
