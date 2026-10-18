import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createAdminRouteEnv,
  jsonRequest,
  loginAdmin,
} from "./admin-route-test-helpers";

type App = ReturnType<typeof createWorkerApp>;

interface ConfigRecord {
  id: string;
  name: string;
  modelId: string;
  channelId: string | null;
  channelName: string | null;
  apiFormat: string;
  enabled: boolean;
  isMaintenance: boolean;
  checkIntervalSeconds: number | null;
  inheritsEndpoint: boolean;
  keySource: string;
}

async function setup() {
  const env = await createAdminRouteEnv();
  const app = createWorkerApp();
  const cookie = await loginAdmin(app, env);

  async function post(path: string, body: unknown) {
    return app.request(`http://example.com${path}`, jsonRequest("POST", cookie, body), env);
  }

  async function createChannel(name: string, withCredentials = true) {
    const response = await post("/api/admin/channels", {
      name,
      sortOrder: 0,
      ...(withCredentials
        ? { baseUrl: `https://${name.toLowerCase()}.example.com`, apiKey: "sk-test" }
        : {}),
    });
    return ((await response.json()) as { id: string }).id;
  }

  async function importModels(channelId: string, models: string[]) {
    const response = await post(`/api/admin/channels/${channelId}/import-models`, {
      models: models.map((model) => ({ model, type: "openai" })),
    });
    expect(response.status).toBe(201);
  }

  async function listConfigs() {
    const response = await app.request(
      "http://example.com/api/admin/configs",
      { headers: { Cookie: cookie } },
      env
    );
    return (await response.json()) as ConfigRecord[];
  }

  async function listModels() {
    const response = await app.request(
      "http://example.com/api/admin/models",
      { headers: { Cookie: cookie } },
      env
    );
    return (await response.json()) as Array<{ id: string; model: string }>;
  }

  return { app: app as App, env, post, createChannel, importModels, listConfigs, listModels };
}

describe("admin bulk management routes", () => {
  it("updates only the requested fields on selected configs", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    await importModels(codex, ["gpt-6-sol", "gpt-6.1-sol", "gpt-5.5"]);
    const configs = await listConfigs();
    const target = configs.filter((config) => config.name !== "gpt-5.5");

    const response = await post("/api/admin/configs/bulk/update", {
      ids: target.map((config) => config.id),
      patch: { apiFormat: "responses", enabled: false, checkIntervalSeconds: 120 },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: 2 });
    const after = await listConfigs();
    for (const config of after) {
      if (config.name === "gpt-5.5") {
        expect(config).toMatchObject({
          apiFormat: "chat_completions",
          enabled: true,
          checkIntervalSeconds: null,
        });
      } else {
        expect(config).toMatchObject({
          apiFormat: "responses",
          enabled: false,
          checkIntervalSeconds: 120,
          isMaintenance: false,
        });
      }
    }

    // null 恢复为使用站点默认频次
    await post("/api/admin/configs/bulk/update", {
      ids: target.map((config) => config.id),
      patch: { checkIntervalSeconds: null },
    });
    expect(
      (await listConfigs()).every((config) => config.checkIntervalSeconds === null)
    ).toBe(true);
  });

  it("validates bulk update payloads", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    await importModels(codex, ["gpt-6-sol"]);
    const [config] = await listConfigs();

    const cases: Array<[unknown, string]> = [
      [{ ids: [], patch: { enabled: true } }, "请至少选择一项"],
      [{ ids: [config.id] }, "请选择要修改的字段"],
      [{ ids: [config.id], patch: {} }, "请选择要修改的字段"],
      [
        { ids: [config.id], patch: { checkIntervalSeconds: 5 } },
        "检查频次覆盖必须在 15 到 3600 秒之间",
      ],
      [{ ids: [config.id], patch: { apiFormat: "grpc" } }, "API 格式非法"],
      [
        { ids: Array.from({ length: 201 }, (_, index) => `id-${index}`), patch: { enabled: true } },
        "一次最多操作 200 项",
      ],
    ];
    for (const [body, message] of cases) {
      const response = await post("/api/admin/configs/bulk/update", body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: message });
    }
  });

  it("moves configs to another channel only when it can supply inherited credentials", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    const bare = await createChannel("Bare", false);
    const azure = await createChannel("Azure");
    await importModels(codex, ["gpt-6-sol"]);
    const [config] = await listConfigs();

    const refused = await post("/api/admin/configs/bulk/update", {
      ids: [config.id],
      patch: { channelId: bare },
    });
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toEqual({
      error: "目标渠道缺少 Base URL 或 API Key，无法接收：gpt-6-sol",
    });

    const missing = await post("/api/admin/configs/bulk/update", {
      ids: [config.id],
      patch: { channelId: "missing" },
    });
    expect(missing.status).toBe(404);

    const moved = await post("/api/admin/configs/bulk/update", {
      ids: [config.id],
      patch: { channelId: azure },
    });
    expect(moved.status).toBe(200);
    expect((await listConfigs())[0]).toMatchObject({
      channelId: azure,
      channelName: "Azure",
    });
  });

  it("copies configs to another channel, inheriting its credentials and skipping duplicates", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    const azure = await createChannel("Azure");
    await importModels(codex, ["gpt-6-sol", "gpt-6.1-sol"]);
    await importModels(azure, ["gpt-6-sol"]);
    const codexConfigs = (await listConfigs()).filter(
      (config) => config.channelId === codex
    );
    await post("/api/admin/configs/bulk/update", {
      ids: codexConfigs.map((config) => config.id),
      patch: { apiFormat: "responses", isMaintenance: true },
    });

    const response = await post("/api/admin/configs/bulk/copy", {
      ids: codexConfigs.map((config) => config.id),
      channelId: azure,
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ created: 1, skipped: 1 });
    const azureConfigs = (await listConfigs()).filter(
      (config) => config.channelId === azure
    );
    expect(azureConfigs.map((config) => config.name).sort()).toEqual([
      "gpt-6-sol",
      "gpt-6.1-sol",
    ]);
    expect(azureConfigs.find((config) => config.name === "gpt-6.1-sol")).toMatchObject({
      apiFormat: "responses",
      isMaintenance: true,
      inheritsEndpoint: true,
      keySource: "channel",
    });
  });

  it("refuses to copy into a channel without base URL and key", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    const bare = await createChannel("Bare", false);
    await importModels(codex, ["gpt-6-sol"]);
    const [config] = await listConfigs();

    const response = await post("/api/admin/configs/bulk/copy", {
      ids: [config.id],
      channelId: bare,
    });

    expect(response.status).toBe(409);
    expect((await listConfigs()).length).toBe(1);
  });

  it("deletes selected configs", async () => {
    const { post, createChannel, importModels, listConfigs } = await setup();
    const codex = await createChannel("Codex");
    await importModels(codex, ["gpt-6-sol", "gpt-6.1-sol", "gpt-5.5"]);
    const configs = await listConfigs();

    const response = await post("/api/admin/configs/bulk/delete", {
      ids: [configs[0].id, configs[1].id, "missing"],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 2 });
    expect((await listConfigs()).map((config) => config.id)).toEqual([configs[2].id]);
  });

  it("deletes unused models in bulk and reports the ones still in use", async () => {
    const { post, createChannel, importModels, listModels } = await setup();
    const codex = await createChannel("Codex");
    await importModels(codex, ["gpt-6-sol"]);
    const unused = await post("/api/admin/models", {
      type: "openai",
      model: "gpt-unused",
      templateId: null,
    });
    const unusedId = ((await unused.json()) as { id: string }).id;
    const inUseId = (await listModels()).find((model) => model.model === "gpt-6-sol")!.id;

    const response = await post("/api/admin/models/bulk/delete", {
      ids: [unusedId, inUseId],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: 1,
      skippedInUse: [inUseId],
    });
    expect((await listModels()).map((model) => model.model)).toEqual(["gpt-6-sol"]);
  });

  it("marks models monitored by other channels in the upstream import list", async () => {
    const { app, env, createChannel, importModels } = await setup();
    const codex = await createChannel("Codex");
    const azure = await createChannel("Azure");
    await importModels(codex, ["gpt-6-sol"]);

    const { createUpstreamModelRoutes } = await import(
      "../../../../src/worker/routes/admin/upstream-models"
    );
    const { requireAdminSession } = await import(
      "../../../../src/worker/routes/admin/guard"
    );
    const { Hono } = await import("hono");
    const admin = new Hono<{ Bindings: Env }>();
    admin.use("/*", requireAdminSession);
    admin.route(
      "/channels",
      createUpstreamModelRoutes(async () =>
        Response.json({ data: [{ id: "gpt-6-sol" }, { id: "gpt-6.1-sol" }] })
      )
    );
    const upstreamApp = new Hono<{ Bindings: Env }>();
    upstreamApp.route("/api/admin", admin);
    const cookie = await loginAdmin(app, env);

    const response = await upstreamApp.request(
      `http://example.com/api/admin/channels/${azure}/upstream-models`,
      { headers: { Cookie: cookie } },
      env
    );

    await expect(response.json()).resolves.toEqual({
      models: [
        {
          id: "gpt-6-sol",
          type: "openai",
          ownedBy: null,
          modelExists: true,
          monitored: false,
          otherChannels: ["Codex"],
        },
        {
          id: "gpt-6.1-sol",
          type: "openai",
          ownedBy: null,
          modelExists: false,
          monitored: false,
          otherChannels: [],
        },
      ],
    });
  });
});
