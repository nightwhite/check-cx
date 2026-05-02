import { describe, expect, it } from "vitest";

import { writeDashboardSnapshot } from "../../../src/worker/jobs/write-dashboard-snapshot";
import type { D1Executor, D1StatementLike } from "../../../src/worker/db/repositories";
import type { WorkerCheckResult } from "../../../src/worker/providers";

interface SnapshotRow {
  payload_json: string;
}

class FakeStatement implements D1StatementLike {
  constructor(
    private readonly db: FakeD1,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, values);
  }

  async first<T>() {
    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    return (this.db.rows.get(key) ?? null) as T | null;
  }

  async run() {
    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    this.db.rows.set(key, {
      payload_json: String(this.values[2]),
    });
    return { meta: { changes: 1 } };
  }
}

class FakeD1 implements D1Executor {
  readonly rows = new Map<string, SnapshotRow>();

  prepare() {
    return new FakeStatement(this);
  }
}

function createResult(id: string, groupName: string | null): WorkerCheckResult {
  return {
    id,
    name: id,
    type: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    status: "operational",
    latencyMs: 100,
    pingLatencyMs: 10,
    checkedAt: "2026-05-02T00:00:00.000Z",
    message: "OK",
    groupName,
  };
}

describe("writeDashboardSnapshot", () => {
  it("writes dashboard and group snapshots for every period", async () => {
    const db = new FakeD1();

    await expect(
      writeDashboardSnapshot(
        db,
        [createResult("core-1", "core"), createResult("solo-1", null)],
        1_000
      )
    ).resolves.toEqual({ writtenSnapshots: 6 });

    expect(db.rows.has("dashboard:7d")).toBe(true);
    expect(db.rows.has("group:core:7d")).toBe(true);
    expect(
      JSON.parse(db.rows.get("group:core:7d")?.payload_json ?? "{}").total
    ).toBe(1);
  });
});
