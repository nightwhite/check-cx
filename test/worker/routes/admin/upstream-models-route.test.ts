import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import { requireAdminSession } from "../../../../src/worker/routes/admin/guard";
import { createUpstreamModelRoutes } from "../../../../src/worker/routes/admin/upstream-models";
import {
  createAdminRouteEnv,
  jsonRequest,
  loginAdmin,
} from "./admin-route-test-helpers";

function createApp(fetcher: Parameters<typeof createUpstreamModelRoutes>[0]) {
  const admin = new Hono<{ Bindings: Env }>();
  admin.use("/*", requireAdminSession);
  admin.route("/channels", createUpstreamModelRoutes(fetcher));
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/admin", admin);
  return app;
}

async function setup(channel: Record<string, unknown>) {
  const env = await createAdminRouteEnv();
  const workerApp = createWorkerApp();
  const cookie = await loginAdmin(workerApp, env);
  const response = await workerApp.request(
    "http://example.com/api/admin/channels",
    jsonRequest("POST", cookie, { name: "Relay", sortOrder: 0, ...channel }),
    env
  );
  const created = (await response.json()) as { id: string };
  return { env, workerApp, cookie, channelId: created.id };
}

describe("admin upstream model import", () => {
  it("lists upstream models and marks existing and monitored ones", async () => {
    const { env, workerApp, cookie, channelId } = await setup({
      baseUrl: "https://relay.example.com",
      apiKey: "sk-relay",
    });
    await workerApp.request(
      `http://example.com/api/admin/channels/${channelId}/import-models`,
      jsonRequest("POST", cookie, { models: [{ model: "gpt-6", type: "openai" }] }),
      env
    );
    const fetcher = vi.fn(async () =>
      Response.json({ data: [{ id: "gpt-6" }, { id: "claude-opus-5-5" }] })
    );

    const response = await createApp(fetcher).request(
      `http://example.com/api/admin/channels/${channelId}/upstream-models`,
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [
        {
          id: "claude-opus-5-5",
          type: "anthropic",
          ownedBy: null,
          modelExists: false,
          monitored: false,
          otherChannels: [],
        },
        {
          id: "gpt-6",
          type: "openai",
          ownedBy: null,
          modelExists: true,
          monitored: true,
          otherChannels: [],
        },
      ],
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://relay.example.com/v1/models");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-relay");
  });

  it("requires base URL and key before fetching", async () => {
    const { env, cookie, channelId } = await setup({});
    const fetcher = vi.fn();

    const response = await createApp(fetcher).request(
      `http://example.com/api/admin/channels/${channelId}/upstream-models`,
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "渠道未配置 Base URL，无法获取上游模型",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces upstream failures as 409 with a readable message", async () => {
    const { env, cookie, channelId } = await setup({
      baseUrl: "https://relay.example.com",
      apiKey: "sk-bad",
    });

    const response = await createApp(async () => new Response("", { status: 401 })).request(
      `http://example.com/api/admin/channels/${channelId}/upstream-models`,
      { headers: { Cookie: cookie } },
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "上游拒绝了 API Key（HTTP 401）",
    });
  });

  it("imports models and inherited monitor configs without duplicates", async () => {
    const { env, workerApp, cookie, channelId } = await setup({
      baseUrl: "https://relay.example.com",
      apiKey: "sk-relay",
    });
    const body = {
      models: [
        { model: "gpt-6", type: "openai", apiFormat: "responses" },
        { model: "claude-opus-5-5", type: "anthropic" },
      ],
    };

    const first = await workerApp.request(
      `http://example.com/api/admin/channels/${channelId}/import-models`,
      jsonRequest("POST", cookie, body),
      env
    );
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toEqual({
      modelsCreated: 2,
      modelsReused: 0,
      configsCreated: 2,
      configsSkipped: 0,
    });

    const second = await workerApp.request(
      `http://example.com/api/admin/channels/${channelId}/import-models`,
      jsonRequest("POST", cookie, body),
      env
    );
    await expect(second.json()).resolves.toEqual({
      modelsCreated: 0,
      modelsReused: 2,
      configsCreated: 0,
      configsSkipped: 2,
    });

    const configs = (await (
      await workerApp.request(
        "http://example.com/api/admin/configs",
        { headers: { Cookie: cookie } },
        env
      )
    ).json()) as Array<Record<string, unknown>>;
    expect(configs).toHaveLength(2);
    expect(configs.find((config) => config.name === "gpt-6")).toMatchObject({
      apiFormat: "responses",
      inheritsEndpoint: true,
      keySource: "channel",
      effectiveEndpoint: "https://relay.example.com/v1/responses",
    });
  });

  it("can import models only, and refuses configs without channel credentials", async () => {
    const { env, workerApp, cookie, channelId } = await setup({});

    const refused = await workerApp.request(
      `http://example.com/api/admin/channels/${channelId}/import-models`,
      jsonRequest("POST", cookie, { models: [{ model: "gpt-6" }] }),
      env
    );
    expect(refused.status).toBe(409);

    const modelsOnly = await workerApp.request(
      `http://example.com/api/admin/channels/${channelId}/import-models`,
      jsonRequest("POST", cookie, { models: [{ model: "gpt-6" }], createConfigs: false }),
      env
    );
    await expect(modelsOnly.json()).resolves.toMatchObject({
      modelsCreated: 1,
      configsCreated: 0,
    });
  });

  it("validates the import payload", async () => {
    const { env, workerApp, cookie, channelId } = await setup({
      baseUrl: "https://relay.example.com",
      apiKey: "sk-relay",
    });

    for (const [body, error] of [
      [{ models: [] }, "请至少选择一个模型"],
      [{ models: [{ model: "x", type: "mistral" }] }, undefined],
      [{ models: Array.from({ length: 101 }, (_, i) => ({ model: `m${i}` })) }, "一次最多导入 100 个模型"],
    ] as const) {
      const response = await workerApp.request(
        `http://example.com/api/admin/channels/${channelId}/import-models`,
        jsonRequest("POST", cookie, body),
        env
      );
      expect(response.status).toBe(400);
      if (error) {
        await expect(response.json()).resolves.toEqual({ error });
      }
    }
  });
});
