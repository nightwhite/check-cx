import { describe, expect, it } from "vitest";

import {
  runHealthCheckJob,
  shouldPruneCheckHistory,
} from "../../../src/worker/jobs/run-health-check";
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
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
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
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("INSERT INTO job_runs")) {
      this.db.jobRuns++;
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }
}

class FakeD1 implements JobLockExecutor {
  readonly locks = new Map<string, LockRow>();
  jobRuns = 0;

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch(statements: FakeStatement[]) {
    for (const statement of statements) {
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
        now: () => nowValues.shift() ?? 2_000,
      })
    ).resolves.toMatchObject({
      status: "success",
      checkedCount: 0,
    });

    expect(db.jobRuns).toBe(1);
    expect(db.locks.get("health-check")?.locked_until_ms).toBe(2_000);
  });
});
