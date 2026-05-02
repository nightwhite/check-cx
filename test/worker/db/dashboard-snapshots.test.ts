import { describe, expect, it } from "vitest";

import {
  createDashboardSnapshotRepository,
  type D1Executor,
  type D1StatementLike,
} from "../../../src/worker/db/repositories/dashboard-snapshots";

interface SnapshotRow {
  snapshot_key: string;
  period: string;
  payload_json: string;
  etag: string;
  generated_at_ms: number;
}

class FakeStatement implements D1StatementLike {
  constructor(
    private readonly db: FakeD1,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
    if (!this.query.includes("FROM dashboard_snapshots")) {
      return null;
    }

    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    return (this.db.rows.get(key) ?? null) as T | null;
  }

  async run() {
    if (this.query.startsWith("INSERT INTO dashboard_snapshots")) {
      const row: SnapshotRow = {
        snapshot_key: String(this.values[0]),
        period: String(this.values[1]),
        payload_json: String(this.values[2]),
        etag: String(this.values[3]),
        generated_at_ms: Number(this.values[4]),
      };
      this.db.rows.set(`${row.snapshot_key}:${row.period}`, row);
      return { meta: { changes: 1 } };
    }

    if (this.query.startsWith("DELETE FROM dashboard_snapshots")) {
      const cutoff = Number(this.values[0]);
      let changes = 0;
      for (const [key, row] of this.db.rows) {
        if (row.generated_at_ms < cutoff) {
          this.db.rows.delete(key);
          changes++;
        }
      }
      return { meta: { changes } };
    }

    return { meta: { changes: 0 } };
  }
}

class FakeD1 implements D1Executor {
  readonly rows = new Map<string, SnapshotRow>();

  prepare(query: string) {
    return new FakeStatement(this, query);
  }
}

describe("dashboard snapshot repository", () => {
  it("upserts, reads, and prunes dashboard snapshots", async () => {
    const repository = createDashboardSnapshotRepository(new FakeD1());

    await repository.upsert({
      snapshotKey: "dashboard",
      period: "7d",
      payloadJson: "{\"total\":1}",
      etag: "\"abc\"",
      generatedAtMs: 100,
    });

    await expect(repository.find("dashboard", "7d")).resolves.toEqual({
      snapshotKey: "dashboard",
      period: "7d",
      payloadJson: "{\"total\":1}",
      etag: "\"abc\"",
      generatedAtMs: 100,
    });
    await expect(repository.pruneBefore(101)).resolves.toBe(1);
    await expect(repository.find("dashboard", "7d")).resolves.toBeNull();
  });
});
