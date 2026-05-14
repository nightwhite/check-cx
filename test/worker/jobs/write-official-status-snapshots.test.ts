import { describe, expect, it } from "vitest";

import {
  writeOfficialStatusSnapshots,
  type OfficialStatusCheckResult,
} from "../../../src/worker/jobs/write-official-status-snapshots";

class FakeStatement {
  constructor(
    private readonly db: FakeD1,
    readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async run() {
    if (this.query.includes("official_status_snapshots")) {
      this.db.rows.set(String(this.values[0]), {
        status: String(this.values[1]),
        message: String(this.values[2]),
        affectedComponentsJson: this.values[3],
        checkedAtMs: Number(this.values[4]),
      });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

class FakeD1 {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly batchSizes: number[] = [];

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch(statements: FakeStatement[]) {
    this.batchSizes.push(statements.length);
    for (const statement of statements) {
      await statement.run();
    }
    return [];
  }
}

describe("writeOfficialStatusSnapshots", () => {
  it("writes official provider status snapshots to D1", async () => {
    const db = new FakeD1();

    await expect(
      writeOfficialStatusSnapshots(
        db as unknown as Parameters<typeof writeOfficialStatusSnapshots>[0],
        async () =>
          new Map<string, OfficialStatusCheckResult>([
            [
              "openai",
              {
                status: "degraded",
                message: "Incident",
                checkedAt: "2026-05-03T00:00:00.000Z",
                affectedComponents: ["API"],
              },
            ],
            [
              "gemini",
              {
                status: "unknown",
                message: "未配置官方状态检查",
                checkedAt: "2026-05-03T00:00:00.000Z",
              },
            ],
          ])
      )
    ).resolves.toEqual({ writtenSnapshots: 2 });

    expect(db.batchSizes).toEqual([2]);
    expect(db.rows.get("openai")).toEqual({
      status: "degraded",
      message: "Incident",
      affectedComponentsJson: "[\"API\"]",
      checkedAtMs: Date.parse("2026-05-03T00:00:00.000Z"),
    });
  });
});
