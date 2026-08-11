import { describe, expect, it } from "vitest";

import { encryptProviderKey } from "../../../../src/worker/crypto/provider-key";
import {
  createAdminChannelRepository,
  createAdminConfigRepository,
  createAdminGroupRepository,
  createAdminModelRepository,
  createAdminNotificationRepository,
  createAdminRuntimeRepository,
  createAdminTemplateRepository,
} from "../../../../src/worker/db/repositories/admin";
import {
  createMigratedDatabase,
  type DatabaseLike,
  type StatementSyncLike,
} from "../sqljs-test-helper";

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

async function createD1() {
  return new D1SqliteAdapter(await createMigratedDatabase());
}

describe("admin repositories", () => {
  it("creates, lists, updates, and deletes request templates", async () => {
    const repository = createAdminTemplateRepository(await createD1());

    await repository.create({
      id: "template-1",
      name: "OpenAI template",
      type: "openai",
      requestHeader: { "x-custom": "1" },
      metadata: { temperature: 0 },
      nowMs: 100,
    });

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({
        id: "template-1",
        requestHeader: { "x-custom": "1" },
        metadata: { temperature: 0 },
      }),
    ]);

    await repository.update("template-1", {
      name: "OpenAI template updated",
      type: "openai",
      requestHeader: null,
      metadata: null,
      nowMs: 200,
    });

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({
        name: "OpenAI template updated",
        requestHeader: null,
        metadata: null,
        updatedAtMs: 200,
      }),
    ]);

    await expect(repository.delete("template-1")).resolves.toBe(true);
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.delete("missing-template")).resolves.toBe(false);
  });

  it("creates, lists, updates, and deletes models", async () => {
    const db = await createD1();
    const templates = createAdminTemplateRepository(db);
    const models = createAdminModelRepository(db);
    await templates.create({
      id: "template-1",
      name: "OpenAI template",
      type: "openai",
      requestHeader: null,
      metadata: null,
      nowMs: 100,
    });

    await models.create({
      id: "model-1",
      type: "openai",
      model: "gpt-4o-mini",
      templateId: "template-1",
      nowMs: 110,
    });

    await expect(models.list()).resolves.toEqual([
      expect.objectContaining({
        id: "model-1",
        model: "gpt-4o-mini",
        templateId: "template-1",
        templateName: "OpenAI template",
      }),
    ]);

    await models.update("model-1", {
      type: "openai",
      model: "gpt-4o",
      templateId: null,
      nowMs: 200,
    });

    await expect(models.list()).resolves.toEqual([
      expect.objectContaining({
        model: "gpt-4o",
        templateId: null,
        templateName: null,
      }),
    ]);

    await expect(models.delete("model-1")).resolves.toBe(true);
    await expect(models.list()).resolves.toEqual([]);
    await expect(models.delete("missing-model")).resolves.toBe(false);
  });

  it("creates, lists, updates, deletes configs, and never returns secrets", async () => {
    const db = await createD1();
    const encryptionKey = "0123456789abcdef0123456789abcdef";
    await createAdminModelRepository(db).create({
      id: "model-1",
      type: "openai",
      model: "gpt-4o-mini",
      templateId: null,
      nowMs: 100,
    });
    await createAdminChannelRepository(db).create({
      id: "channel-1",
      name: "OpenAI Official",
      logoUrl: null,
      websiteUrl: null,
      statusPageUrl: null,
      sortOrder: 0,
      enabled: true,
      nowMs: 105,
    });
    const configs = createAdminConfigRepository(db);
    const encrypted = await encryptProviderKey("sk-test", encryptionKey);

    await configs.create({
      id: "config-1",
      name: "OpenAI primary",
      type: "openai",
      modelId: "model-1",
      channelId: "channel-1",
      endpoint: "https://api.openai.com/v1/chat/completions",
      encryptedKey: encrypted,
      enabled: true,
      isMaintenance: false,
      groupName: "core",
      checkIntervalSeconds: null,
      region: null,
      nowMs: 110,
    });

    const [created] = await configs.list();
    expect(created).toMatchObject({
      id: "config-1",
      name: "OpenAI primary",
      hasApiKey: true,
      model: "gpt-4o-mini",
    });
    expect(created).not.toHaveProperty("apiKeyCiphertext");
    expect(created).not.toHaveProperty("apiKeyNonce");

    await configs.update("config-1", {
      name: "OpenAI backup",
      type: "openai",
      modelId: "model-1",
      channelId: "channel-1",
      endpoint: "https://example.com/v1/chat/completions",
      enabled: false,
      isMaintenance: true,
      groupName: null,
      checkIntervalSeconds: 120,
      region: "us-east-1",
      nowMs: 200,
    });

    await expect(configs.list()).resolves.toEqual([
      expect.objectContaining({
        name: "OpenAI backup",
        endpoint: "https://example.com/v1/chat/completions",
        enabled: false,
        isMaintenance: true,
        groupName: null,
        hasApiKey: true,
      }),
    ]);

    const replacement = await encryptProviderKey("sk-replacement", encryptionKey);
    await configs.replaceSecret("config-1", replacement, 300);

    await expect(configs.list()).resolves.toEqual([
      expect.objectContaining({
        hasApiKey: true,
        updatedAtMs: 300,
      }),
    ]);

    await expect(configs.delete("config-1")).resolves.toBe(true);
    await expect(configs.list()).resolves.toEqual([]);
    await expect(configs.delete("missing-config")).resolves.toBe(false);
  });

  it("creates, lists, updates, and deletes groups", async () => {
    const groups = createAdminGroupRepository(await createD1());

    await groups.create({
      id: "group-1",
      groupName: "core",
      websiteUrl: "https://status.example.com",
      tags: "prod,ai",
      nowMs: 100,
    });
    await groups.update("group-1", {
      groupName: "edge",
      websiteUrl: null,
      tags: "",
      nowMs: 200,
    });

    await expect(groups.list()).resolves.toEqual([
      expect.objectContaining({
        id: "group-1",
        groupName: "edge",
        websiteUrl: null,
        tags: "",
        updatedAtMs: 200,
      }),
    ]);
    await expect(groups.delete("group-1")).resolves.toBe(true);
    await expect(groups.list()).resolves.toEqual([]);
    await expect(groups.delete("missing-group")).resolves.toBe(false);
  });

  it("creates, lists, updates, and deletes notifications", async () => {
    const notifications = createAdminNotificationRepository(await createD1());

    await notifications.create({
      id: "notification-1",
      message: "OpenAI maintenance",
      level: "warning",
      isActive: true,
      nowMs: 100,
    });
    await notifications.update("notification-1", {
      message: "Resolved",
      level: "info",
      isActive: false,
    });

    await expect(notifications.list()).resolves.toEqual([
      expect.objectContaining({
        id: "notification-1",
        message: "Resolved",
        level: "info",
        isActive: false,
      }),
    ]);
    await expect(notifications.delete("notification-1")).resolves.toBe(true);
    await expect(notifications.list()).resolves.toEqual([]);
    await expect(notifications.delete("missing-notification")).resolves.toBe(false);
  });

  it("reads runtime status from jobs, locks, snapshots, and latest checks", async () => {
    const rawDb = await createMigratedDatabase();
    const db = new D1SqliteAdapter(rawDb);
    rawDb
      .prepare(
        "INSERT INTO job_runs (id, job_name, owner_id, status, started_at_ms, finished_at_ms, checked_count, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run("run-1", "health-check", "owner-1", "success", 100, 150, 2, null);
    rawDb
      .prepare(
        "INSERT INTO job_locks (job_name, owner_id, locked_until_ms, updated_at_ms) VALUES (?, ?, ?, ?)"
      )
      .run("health-check", "owner-1", 500, 120);
    rawDb
      .prepare(
        "INSERT INTO dashboard_snapshots (snapshot_key, period, payload_json, etag, generated_at_ms) VALUES (?, ?, ?, ?, ?)"
      )
      .run("dashboard", "7d", "{}", "\"etag\"", 160);
    rawDb
      .prepare(
        "INSERT INTO check_models (id, type, model, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
      )
      .run("model-1", "openai", "gpt-4o-mini", 1, 1);
    rawDb
      .prepare(
        "INSERT INTO check_configs (id, name, type, model_id, endpoint, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("config-1", "OpenAI", "openai", "model-1", "https://example.com", 1, 1);
    rawDb
      .prepare(
        "INSERT INTO check_latest (config_id, status, checked_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)"
      )
      .run("config-1", "operational", 170, 171);

    await expect(createAdminRuntimeRepository(db).getStatus()).resolves.toEqual({
      cron: {
        expression: "*/1 * * * *",
        label: "每 1 分钟",
      },
      recentRuns: [
        {
          id: "run-1",
          jobName: "health-check",
          ownerId: "owner-1",
          status: "success",
          startedAtMs: 100,
          finishedAtMs: 150,
          checkedCount: 2,
          errorMessage: null,
        },
      ],
      locks: [
        {
          jobName: "health-check",
          ownerId: "owner-1",
          lockedUntilMs: 500,
          updatedAtMs: 120,
        },
      ],
      snapshots: [
        {
          snapshotKey: "dashboard",
          period: "7d",
          generatedAtMs: 160,
        },
      ],
      latestCheck: {
        checkedAtMs: 170,
        updatedAtMs: 171,
      },
    });
  });
});
