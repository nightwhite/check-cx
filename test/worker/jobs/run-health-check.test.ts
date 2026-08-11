import { describe, expect, it, vi } from "vitest";

import {
  runHealthCheckJob,
  shouldPruneCheckHistory,
} from "../../../src/worker/jobs/run-health-check";
import { encryptProviderKey } from "../../../src/worker/crypto/provider-key";
import type { JobLockExecutor, JobLockStatementLike } from "../../../src/worker/jobs/job-lock";

interface LockRow {
  job_name: string;
  owner_id: string;
  locked_until_ms: number;
  updated_at_ms: number;
}

class FakeStatement implements JobLockStatementLike {
  constructor(
    private readonly db: FakeD1,
    readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
    if (this.query.includes("FROM check_latest")) {
      return {
        config_id: "config-1",
        status: "operational",
      } as T;
    }
    if (this.query.includes("FROM site_settings")) {
      return {
        site_name: "AI Status",
        public_origin: "https://status.example.com",
        notification_cooldown_seconds: 300,
      } as T;
    }
    if (this.query.includes("FROM notification_settings")) {
      return {
        enabled: 1,
        lark_webhook_ciphertext: this.db.notificationWebhookCiphertext,
        lark_webhook_nonce: this.db.notificationWebhookNonce,
        notify_degraded: 1,
        notify_failed: 1,
        notify_recovered: 1,
      } as T;
    }
    return null as T | null;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async run() {
    if (this.query.includes("SET owner_id")) {
      const jobName = String(this.values[3]);
      const nowMs = Number(this.values[4]);
      const existing = this.db.locks.get(jobName);
      if (!existing || existing.locked_until_ms > nowMs) {
        return { meta: { changes: 0 } };
      }
      this.db.locks.set(jobName, {
        job_name: jobName,
        owner_id: String(this.values[0]),
        locked_until_ms: Number(this.values[1]),
        updated_at_ms: Number(this.values[2]),
      });
      return { meta: { changes: existing ? 1 : 0 } };
    }

    if (this.query.includes("INSERT OR IGNORE INTO job_locks")) {
      const jobName = String(this.values[0]);
      if (this.db.locks.has(jobName)) {
        return { meta: { changes: 0 } };
      }
      this.db.locks.set(jobName, {
        job_name: jobName,
        owner_id: String(this.values[1]),
        locked_until_ms: Number(this.values[2]),
        updated_at_ms: Number(this.values[3]),
      });
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("SET locked_until_ms")) {
      const jobName = String(this.values[2]);
      const ownerId = String(this.values[3]);
      const existing = this.db.locks.get(jobName);
      if (!existing || existing.owner_id !== ownerId) {
        return { meta: { changes: 0 } };
      }
      this.db.locks.set(jobName, {
        ...existing,
        locked_until_ms: Number(this.values[0]),
        updated_at_ms: Number(this.values[1]),
      });
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("INSERT INTO dashboard_snapshots")) {
      this.db.dashboardSnapshotWrites++;
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("INSERT INTO notification_events")) {
      this.db.notificationEvents++;
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("DELETE FROM dashboard_snapshots")) {
      return { meta: { changes: 0 } };
    }

    if (this.query.includes("INSERT INTO job_runs")) {
      if (this.db.failRecordRun) {
        throw new Error("recordRun failed");
      }
      this.db.jobRuns++;
      this.db.lastJobRunFinishedAtMs = Number(this.values[5]);
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }
}

class FakeD1 implements JobLockExecutor {
  readonly locks = new Map<string, LockRow>();
  jobRuns = 0;
  lastJobRunFinishedAtMs: number | null = null;
  failRecordRun = false;
  readonly batchSizes: number[] = [];
  readonly batchQueries: string[] = [];
  dashboardSnapshotWrites = 0;
  notificationEvents = 0;
  notificationWebhookCiphertext: string | null = null;
  notificationWebhookNonce: string | null = null;

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch(statements: FakeStatement[]) {
    this.batchSizes.push(statements.length);
    for (const statement of statements) {
      this.batchQueries.push(statement.query);
      await statement.run();
    }
    return [];
  }
}

describe("runHealthCheckJob", () => {
  it("only prunes history on hourly scheduled runs", () => {
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:00:00.000Z"))
    ).toBe(true);
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:01:00.000Z"))
    ).toBe(false);
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:59:59.999Z"))
    ).toBe(false);
  });

  it("releases the cron lock after a successful run", async () => {
    const db = new FakeD1();
    const encryptedWebhook = await encryptProviderKey(
      "https://open.feishu.cn/open-apis/bot/v2/hook/test",
      "1234567890123456"
    );
    db.notificationWebhookCiphertext = encryptedWebhook.ciphertext;
    db.notificationWebhookNonce = encryptedWebhook.nonce;
    const nowValues = [1_000, 2_000];
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    await expect(
      runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
        ownerId: "owner-1",
        loadConfigs: async () => [],
        writeOfficialStatuses: async () => undefined,
        now: () => nowValues.shift() ?? 2_000,
      })
    ).resolves.toMatchObject({
      status: "success",
      checkedCount: 0,
    });

    expect(db.jobRuns).toBe(1);
    expect(db.dashboardSnapshotWrites).toBe(0);
    expect(db.locks.get("health-check")?.locked_until_ms).toBe(2_000);
  });

  it("does not overwrite dashboard snapshots when no configs are due", async () => {
    const db = new FakeD1();
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    await runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
      ownerId: "owner-1",
      loadConfigs: async () => [],
      writeOfficialStatuses: async () => undefined,
      now: () => 1_000,
    });

    expect(db.dashboardSnapshotWrites).toBe(0);
  });

  it("releases the cron lock when recording a successful run fails", async () => {
    const db = new FakeD1();
    db.failRecordRun = true;
    const nowValues = [1_000, 2_000, 3_000];
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    await expect(
      runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
        ownerId: "owner-1",
        loadConfigs: async () => [],
        writeOfficialStatuses: async () => undefined,
        now: () => nowValues.shift() ?? 3_000,
      })
    ).resolves.toMatchObject({
      status: "failed",
      ownerId: "owner-1",
    });

    expect(db.locks.get("health-check")?.locked_until_ms).toBe(3_000);
  });

  it("does not persist maintenance results into history or rollups", async () => {
    const db = new FakeD1();
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    await runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
      ownerId: "owner-1",
      loadConfigs: async () => [
        {
          id: "config-1",
          name: "OpenAI",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          apiKey: "",
          isMaintenance: true,
        },
      ],
      runCheck: async () => ({
        id: "config-1",
        name: "OpenAI",
        type: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        status: "maintenance",
        latencyMs: null,
        pingLatencyMs: null,
        checkedAt: "2026-05-03T01:01:00.000Z",
        message: "维护模式",
      }),
      writeOfficialStatuses: async () => undefined,
      now: () => 1_000,
    });

    expect(db.batchQueries.filter((query) => query.includes("check_latest"))).toHaveLength(1);
    expect(db.batchQueries.filter((query) => query.includes("check_history"))).toHaveLength(0);
    expect(db.batchQueries.filter((query) => query.includes("availability_rollups"))).toHaveLength(0);
  });

  it("uses injected official status writer and records finish time after job work", async () => {
    const db = new FakeD1();
    const officialWriter = vi.fn(async () => undefined);
    const nowValues = [1_000, 2_000, 3_000];
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    await expect(
      runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
        ownerId: "owner-1",
        loadConfigs: async () => [],
        writeOfficialStatuses: officialWriter,
        now: () => nowValues.shift() ?? 3_000,
      })
    ).resolves.toMatchObject({ status: "success" });

    expect(officialWriter).toHaveBeenCalledOnce();
    expect(db.lastJobRunFinishedAtMs).toBe(3_000);
    expect(db.locks.get("health-check")?.locked_until_ms).toBe(3_000);
  });

  it("records notification event attempts after persisting changed results", async () => {
    const db = new FakeD1();
    const encryptedWebhook = await encryptProviderKey(
      "https://open.feishu.cn/open-apis/bot/v2/hook/test",
      "1234567890123456"
    );
    db.notificationWebhookCiphertext = encryptedWebhook.ciphertext;
    db.notificationWebhookNonce = encryptedWebhook.nonce;
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response("asset") },
      CONFIG_ENCRYPTION_KEY: "1234567890123456",
    } as unknown as Env;

    const jobResult = await runHealthCheckJob(env, Date.parse("2026-05-03T01:01:00.000Z"), {
      ownerId: "owner-1",
      loadConfigs: async () => [
        {
          id: "config-1",
          name: "OpenAI",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          apiKey: "sk-test",
          isMaintenance: false,
          channelName: "OpenAI Official",
        },
      ],
      runCheck: async () => ({
        id: "config-1",
        name: "OpenAI",
        type: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        status: "degraded",
        latencyMs: 900,
        pingLatencyMs: 10,
        checkedAt: "2026-05-03T01:01:00.000Z",
        message: "slow",
        channelName: "OpenAI Official",
      }),
      writeOfficialStatuses: async () => undefined,
      now: () => 1_000,
    });

    expect(jobResult.status).toBe("success");
    expect(db.notificationEvents).toBe(1);
  });
});
