import { describe, expect, it } from "vitest";

import { persistCheckResults } from "../../../src/worker/jobs/persist-check-results";
import type { D1StatementLike } from "../../../src/worker/db/repositories";
import type { WorkerCheckResult } from "../../../src/worker/providers";

class FakeStatement implements D1StatementLike {
  constructor(
    readonly query: string,
    readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.query, values);
  }

  async first<T>() {
    return null as T | null;
  }

  async all<T>() {
    return { success: true, results: [] as T[], meta: {} };
  }

  async raw<T = unknown[]>() {
    return [] as T[];
  }

  async run() {
    return { success: true as const, meta: { changes: 1 } };
  }
}

class FakeD1 {
  readonly batchCalls: FakeStatement[][] = [];

  prepare(query: string) {
    return new FakeStatement(query);
  }

  async batch(statements: D1PreparedStatement[]) {
    this.batchCalls.push(statements as unknown as FakeStatement[]);
    return statements.map(() => ({ success: true as const, meta: {} }));
  }
}

function createResult(id: string): WorkerCheckResult {
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
  };
}

describe("persistCheckResults", () => {
  it("persists history and latest rows with one D1 batch", async () => {
    const db = new FakeD1();

    await persistCheckResults(
      db as unknown as Parameters<typeof persistCheckResults>[0],
      [createResult("config-1"), createResult("config-2")],
      1_000
    );

    expect(db.batchCalls).toHaveLength(1);
    expect(db.batchCalls[0]).toHaveLength(6);
    expect(db.batchCalls[0].map((statement) => statement.query)).toEqual([
      expect.stringContaining("INSERT INTO check_history"),
      expect.stringContaining("INSERT INTO check_latest"),
      expect.stringContaining("UPDATE check_configs"),
      expect.stringContaining("INSERT INTO check_history"),
      expect.stringContaining("INSERT INTO check_latest"),
      expect.stringContaining("UPDATE check_configs"),
    ]);
  });

  it("chunks D1 batches to at most 100 statements", async () => {
    const db = new FakeD1();

    await persistCheckResults(
      db as unknown as Parameters<typeof persistCheckResults>[0],
      Array.from({ length: 75 }, (_, index) => createResult(`config-${index}`)),
      1_000
    );

    expect(db.batchCalls.length).toBeGreaterThan(1);
    expect(db.batchCalls.every((call) => call.length <= 100)).toBe(true);
    expect(db.batchCalls.reduce((sum, call) => sum + call.length, 0)).toBe(225);
  });

  it("can skip history writes while still updating latest rows", async () => {
    const db = new FakeD1();

    await persistCheckResults(
      db as unknown as Parameters<typeof persistCheckResults>[0],
      [
        { ...createResult("config-1"), status: "maintenance" },
        createResult("config-2"),
      ],
      1_000,
      { shouldWriteHistory: (result) => result.status !== "maintenance" }
    );

    expect(db.batchCalls).toHaveLength(1);
    expect(db.batchCalls[0].map((statement) => statement.query)).toEqual([
      expect.stringContaining("INSERT INTO check_latest"),
      expect.stringContaining("UPDATE check_configs"),
      expect.stringContaining("INSERT INTO check_history"),
      expect.stringContaining("INSERT INTO check_latest"),
      expect.stringContaining("UPDATE check_configs"),
    ]);
  });
});
