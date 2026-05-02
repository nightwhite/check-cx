import { describe, expect, it } from "vitest";

import {
  createJobLockRepository,
  type JobLockExecutor,
  type JobLockStatementLike,
} from "../../../src/worker/jobs/job-lock";

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
    if (!this.query.includes("FROM job_locks")) {
      return null;
    }
    const row = this.db.locks.get(String(this.values[0])) ?? null;
    return row as T | null;
  }

  async run() {
    if (
      this.query.startsWith("UPDATE job_locks") &&
      this.query.includes("SET owner_id")
    ) {
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
      return { meta: { changes: 1 } };
    }

    if (
      this.query.startsWith("UPDATE job_locks") &&
      this.query.includes("SET locked_until_ms")
    ) {
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

    if (this.query.startsWith("INSERT OR IGNORE INTO job_locks")) {
      if (this.db.locks.has(String(this.values[0]))) {
        return { meta: { changes: 0 } };
      }

      const row: LockRow = {
        job_name: String(this.values[0]),
        owner_id: String(this.values[1]),
        locked_until_ms: Number(this.values[2]),
        updated_at_ms: Number(this.values[3]),
      };
      this.db.locks.set(row.job_name, row);
      return { meta: { changes: 1 } };
    }

    if (this.query.startsWith("INSERT INTO job_runs")) {
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
}

describe("job lock repository", () => {
  it("prevents overlap while an existing lock is active", async () => {
    const db = new FakeD1();
    const repository = createJobLockRepository(db);

    await expect(
      repository.acquire({
        jobName: "health-check",
        ownerId: "owner-1",
        nowMs: 1_000,
        ttlMs: 60_000,
      })
    ).resolves.toBe(true);
    await expect(
      repository.acquire({
        jobName: "health-check",
        ownerId: "owner-2",
        nowMs: 2_000,
        ttlMs: 60_000,
      })
    ).resolves.toBe(false);
    expect(db.locks.get("health-check")?.owner_id).toBe("owner-1");
  });

  it("allows a new owner after the previous lock expires", async () => {
    const db = new FakeD1();
    const repository = createJobLockRepository(db);

    await repository.acquire({
      jobName: "health-check",
      ownerId: "owner-1",
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    await expect(
      repository.acquire({
        jobName: "health-check",
        ownerId: "owner-2",
        nowMs: 62_000,
        ttlMs: 60_000,
      })
    ).resolves.toBe(true);
  });

  it("records job runs", async () => {
    const db = new FakeD1();
    const repository = createJobLockRepository(db);

    await repository.recordRun({
      id: "run-1",
      jobName: "health-check",
      ownerId: "owner-1",
      status: "success",
      startedAtMs: 1_000,
      finishedAtMs: 2_000,
      checkedCount: 3,
      errorMessage: null,
    });

    expect(db.jobRuns).toBe(1);
  });

  it("releases a lock only for the matching owner", async () => {
    const db = new FakeD1();
    const repository = createJobLockRepository(db);

    await repository.acquire({
      jobName: "health-check",
      ownerId: "owner-1",
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    await expect(
      repository.release({
        jobName: "health-check",
        ownerId: "owner-2",
        nowMs: 2_000,
      })
    ).resolves.toBe(false);
    expect(db.locks.get("health-check")?.locked_until_ms).toBe(61_000);

    await expect(
      repository.release({
        jobName: "health-check",
        ownerId: "owner-1",
        nowMs: 2_000,
      })
    ).resolves.toBe(true);
    expect(db.locks.get("health-check")?.locked_until_ms).toBe(2_000);
  });
});
