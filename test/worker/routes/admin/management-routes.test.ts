import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createMigratedDatabase,
  type DatabaseLike,
  type StatementSyncLike,
} from "../../db/sqljs-test-helper";

class D1StatementForSqlite {
  constructor(
    private readonly statement: StatementSyncLike,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new D1StatementForSqlite(this.statement, values);
  }

  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async first<T>() {
    return (this.statement.get(...this.values) ?? null) as T | null;
  }

  async run() {
    const result = this.statement.run(...this.values) as { changes?: number } | undefined;
    return { meta: { changes: result?.changes ?? 0 } };
  }
}

class D1SqliteAdapter {
  constructor(private readonly db: DatabaseLike) {}

  prepare(query: string) {
    return new D1StatementForSqlite(this.db.prepare(query));
  }
}

async function createEnv() {
  return {
    ADMIN_TOKEN: "secret-admin-token",
    CONFIG_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    DB: new D1SqliteAdapter(await createMigratedDatabase()),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

async function createEnvWithoutEncryptionKey() {
  const env = await createEnv();
  delete (env as Partial<Env>).CONFIG_ENCRYPTION_KEY;
  return env;
}

async function loginCookie(app: ReturnType<typeof createWorkerApp>, env: Env) {
  const response = await app.request(
    "http://example.com/api/admin/session",
    {
      method: "POST",
      body: JSON.stringify({ token: "secret-admin-token" }),
      headers: { "Content-Type": "application/json" },
    },
    env
  );

  expect(response.status).toBe(200);
  return response.headers.get("Set-Cookie") ?? "";
}

function jsonRequest(method: string, cookie: string, body: unknown) {
  return {
    method,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
  };
}

async function createChannel(
  app: ReturnType<typeof createWorkerApp>,
  env: Env,
  cookie: string,
  name = "OpenAI Official"
) {
  const response = await app.request(
    "http://example.com/api/admin/channels",
    jsonRequest("POST", cookie, {
      name,
      logoUrl: null,
      websiteUrl: "https://openai.com/",
      statusPageUrl: "https://status.openai.com/",
      sortOrder: 10,
      enabled: true,
    }),
    env
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

describe("admin management routes", () => {
  it("rejects admin API requests without a valid session", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/admin/summary",
      {},
      await createEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("manages templates, models, configs, and config secrets without returning secret material", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const templateResponse = await app.request(
      "http://example.com/api/admin/templates",
      jsonRequest("POST", cookie, {
        name: "OpenAI template",
        type: "openai",
        requestHeader: { "x-custom": "1" },
        metadata: { temperature: 0 },
      }),
      env
    );
    expect(templateResponse.status).toBe(201);
    const template = (await templateResponse.json()) as { id: string };

    const templateUpdate = await app.request(
      `http://example.com/api/admin/templates/${template.id}`,
      jsonRequest("PATCH", cookie, {
        name: "OpenAI template updated",
        type: "openai",
        requestHeader: null,
        metadata: null,
      }),
      env
    );
    expect(templateUpdate.status).toBe(200);
    await expect(templateUpdate.json()).resolves.toMatchObject({
      id: template.id,
      name: "OpenAI template updated",
    });

    const modelResponse = await app.request(
      "http://example.com/api/admin/models",
      jsonRequest("POST", cookie, {
        type: "openai",
        model: "gpt-4o-mini",
        templateId: template.id,
      }),
      env
    );
    expect(modelResponse.status).toBe(201);
    const model = (await modelResponse.json()) as { id: string };

    const modelUpdate = await app.request(
      `http://example.com/api/admin/models/${model.id}`,
      jsonRequest("PATCH", cookie, {
        type: "openai",
        model: "gpt-4o",
        templateId: template.id,
      }),
      env
    );
    expect(modelUpdate.status).toBe(200);
    await expect(modelUpdate.json()).resolves.toMatchObject({
      id: model.id,
      model: "gpt-4o",
    });
    const channel = await createChannel(app, env, cookie);

    const configResponse = await app.request(
      "http://example.com/api/admin/configs",
      jsonRequest("POST", cookie, {
        name: "OpenAI primary",
        type: "openai",
        modelId: model.id,
        channelId: channel.id,
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: "sk-test",
        checkIntervalSeconds: 30,
        region: "global",
        enabled: true,
        isMaintenance: false,
      }),
      env
    );
    expect(configResponse.status).toBe(201);
    const config = (await configResponse.json()) as { id: string };

    const listResponse = await app.request(
      "http://example.com/api/admin/configs",
      { headers: { Cookie: cookie } },
      env
    );
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as Array<Record<string, unknown>>;
    expect(list).toEqual([
      expect.objectContaining({
        id: config.id,
        channelId: channel.id,
        channelName: "OpenAI Official",
        checkIntervalSeconds: 30,
        region: "global",
        hasApiKey: true,
      }),
    ]);
    expect(JSON.stringify(list)).not.toContain("sk-test");
    expect(JSON.stringify(list)).not.toContain("api_key_ciphertext");
    expect(JSON.stringify(list)).not.toContain("apiKeyCiphertext");

    const secretResponse = await app.request(
      `http://example.com/api/admin/configs/${config.id}/secret`,
      jsonRequest("POST", cookie, { apiKey: "sk-replacement" }),
      env
    );
    expect(secretResponse.status).toBe(200);
    await expect(secretResponse.json()).resolves.toEqual({
      ok: true,
      hasApiKey: true,
    });

    const configDelete = await app.request(
      `http://example.com/api/admin/configs/${config.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );
    expect(configDelete.status).toBe(200);

    const modelDelete = await app.request(
      `http://example.com/api/admin/models/${model.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );
    expect(modelDelete.status).toBe(200);

    const templateDelete = await app.request(
      `http://example.com/api/admin/templates/${template.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );
    expect(templateDelete.status).toBe(200);
  });

  it("manages groups and notifications one row at a time", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const groupResponse = await app.request(
      "http://example.com/api/admin/groups",
      jsonRequest("POST", cookie, {
        groupName: "core",
        websiteUrl: "https://status.example.com",
        tags: "prod,ai",
      }),
      env
    );
    expect(groupResponse.status).toBe(201);
    const group = (await groupResponse.json()) as { id: string };

    const groupUpdate = await app.request(
      `http://example.com/api/admin/groups/${group.id}`,
      jsonRequest("PATCH", cookie, {
        groupName: "edge",
        websiteUrl: null,
        tags: "",
      }),
      env
    );
    expect(groupUpdate.status).toBe(200);
    await expect(groupUpdate.json()).resolves.toMatchObject({
      groupName: "edge",
    });

    const notificationResponse = await app.request(
      "http://example.com/api/admin/notifications",
      jsonRequest("POST", cookie, {
        message: "OpenAI maintenance",
        level: "warning",
        isActive: true,
      }),
      env
    );
    expect(notificationResponse.status).toBe(201);
    const notification = (await notificationResponse.json()) as { id: string };

    const notificationDelete = await app.request(
      `http://example.com/api/admin/notifications/${notification.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );
    expect(notificationDelete.status).toBe(200);
    await expect(notificationDelete.json()).resolves.toEqual({ ok: true });
  });

  it("rejects admin model/template and config/model provider mismatches", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const templateResponse = await app.request(
      "http://example.com/api/admin/templates",
      jsonRequest("POST", cookie, {
        name: "OpenAI template",
        type: "openai",
        requestHeader: null,
        metadata: null,
      }),
      env
    );
    expect(templateResponse.status).toBe(201);
    const template = (await templateResponse.json()) as { id: string };

    const mismatchedModel = await app.request(
      "http://example.com/api/admin/models",
      jsonRequest("POST", cookie, {
        type: "anthropic",
        model: "claude-sonnet-4.5",
        templateId: template.id,
      }),
      env
    );
    expect(mismatchedModel.status).toBe(409);
    await expect(mismatchedModel.json()).resolves.toEqual({
      error: "模型类型必须与请求模板类型一致",
    });

    const modelResponse = await app.request(
      "http://example.com/api/admin/models",
      jsonRequest("POST", cookie, {
        type: "openai",
        model: "gpt-5.5",
        templateId: template.id,
      }),
      env
    );
    expect(modelResponse.status).toBe(201);
    const model = (await modelResponse.json()) as { id: string };
    const channel = await createChannel(app, env, cookie);

    const mismatchedConfig = await app.request(
      "http://example.com/api/admin/configs",
      jsonRequest("POST", cookie, {
        name: "Claude over OpenAI model",
        type: "anthropic",
        modelId: model.id,
        channelId: channel.id,
        endpoint: "https://example.com/v1/messages",
        apiKey: "sk-test",
        enabled: true,
        isMaintenance: false,
      }),
      env
    );
    expect(mismatchedConfig.status).toBe(409);
    await expect(mismatchedConfig.json()).resolves.toEqual({
      error: "配置类型必须与模型类型一致",
    });
  });

  it("returns 404 when updating or deleting a missing config", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const update = await app.request(
      "http://example.com/api/admin/configs/missing-config",
      jsonRequest("PATCH", cookie, {
        name: "Missing",
        type: "openai",
        modelId: "missing-model",
        channelId: "missing-channel",
        endpoint: "https://example.com/v1/responses",
        enabled: true,
        isMaintenance: false,
      }),
      env
    );
    expect(update.status).toBe(404);
    await expect(update.json()).resolves.toEqual({ error: "配置不存在" });

    const deletion = await app.request(
      "http://example.com/api/admin/configs/missing-config",
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );
    expect(deletion.status).toBe(404);
    await expect(deletion.json()).resolves.toEqual({ error: "配置不存在" });
  });

  it("returns 404 when updating or deleting missing admin resources", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const cases = [
      {
        path: "templates",
        body: {
          name: "Missing template",
          type: "openai",
          requestHeader: null,
          metadata: null,
        },
        error: "请求模板不存在",
      },
      {
        path: "groups",
        body: {
          groupName: "missing-group",
          websiteUrl: null,
          tags: "",
        },
        error: "分组不存在",
      },
      {
        path: "notifications",
        body: {
          message: "Missing notification",
          level: "info",
          isActive: true,
        },
        error: "通知不存在",
      },
    ];

    for (const item of cases) {
      const update = await app.request(
        `http://example.com/api/admin/${item.path}/missing-id`,
        jsonRequest("PATCH", cookie, item.body),
        env
      );
      expect(update.status).toBe(404);
      await expect(update.json()).resolves.toEqual({ error: item.error });

      const deletion = await app.request(
        `http://example.com/api/admin/${item.path}/missing-id`,
        { method: "DELETE", headers: { Cookie: cookie } },
        env
      );
      expect(deletion.status).toBe(404);
      await expect(deletion.json()).resolves.toEqual({ error: item.error });
    }
  });

  it("returns a structured 503 when config encryption is not configured", async () => {
    const app = createWorkerApp();
    const env = await createEnvWithoutEncryptionKey();
    const cookie = await loginCookie(app, env);

    const response = await app.request(
      "http://example.com/api/admin/configs",
      jsonRequest("POST", cookie, {
        name: "OpenAI primary",
        type: "openai",
        modelId: "model-1",
        channelId: "channel-1",
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "sk-test",
        enabled: true,
        isMaintenance: false,
      }),
      env
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "配置加密密钥未配置",
    });
  });

  it("returns 409 when deleting a model that is still used by configs", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const modelResponse = await app.request(
      "http://example.com/api/admin/models",
      jsonRequest("POST", cookie, {
        type: "openai",
        model: "gpt-5.5",
        templateId: null,
      }),
      env
    );
    expect(modelResponse.status).toBe(201);
    const model = (await modelResponse.json()) as { id: string };
    const channel = await createChannel(app, env, cookie);

    const configResponse = await app.request(
      "http://example.com/api/admin/configs",
      jsonRequest("POST", cookie, {
        name: "OpenAI primary",
        type: "openai",
        modelId: model.id,
        channelId: channel.id,
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "sk-test",
        enabled: true,
        isMaintenance: false,
      }),
      env
    );
    expect(configResponse.status).toBe(201);

    const deletion = await app.request(
      `http://example.com/api/admin/models/${model.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env
    );

    expect(deletion.status).toBe(409);
    await expect(deletion.json()).resolves.toEqual({
      error: "模型仍被配置引用，无法删除",
    });
  });

  it("returns summary and runtime status for authenticated admins", async () => {
    const app = createWorkerApp();
    const env = await createEnv();
    const cookie = await loginCookie(app, env);

    const summary = await app.request(
      "http://example.com/api/admin/summary",
      { headers: { Cookie: cookie } },
      env
    );
    expect(summary.status).toBe(200);
    await expect(summary.json()).resolves.toMatchObject({
      modelCount: 0,
      configCount: 0,
      templateCount: 0,
      groupCount: 0,
      activeNotificationCount: 0,
    });

    const runtime = await app.request(
      "http://example.com/api/admin/runtime",
      { headers: { Cookie: cookie } },
      env
    );
    expect(runtime.status).toBe(200);
    await expect(runtime.json()).resolves.toMatchObject({
      cron: {
        expression: "*/1 * * * *",
        label: "每 1 分钟",
      },
      recentRuns: [],
      locks: [],
      snapshots: [],
      latestCheck: null,
    });
  });
});
