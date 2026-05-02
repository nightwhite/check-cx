import { describe, expect, it } from "vitest";

import { updateAvailabilityRollups } from "../../../src/worker/jobs/update-rollups";
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

const result: WorkerCheckResult = {
  id: "config-1",
  name: "OpenAI",
  type: "openai",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  status: "operational",
  latencyMs: 100,
  pingLatencyMs: 10,
  checkedAt: "2026-05-02T00:00:00.000Z",
  message: "OK",
};

describe("updateAvailabilityRollups", () => {
  it("updates all period rollups with one D1 batch", async () => {
    const db = new FakeD1();

    await expect(
      updateAvailabilityRollups(
        db as unknown as Parameters<typeof updateAvailabilityRollups>[0],
        [result],
        1_775_174_400_000
      )
    ).resolves.toEqual({
      updatedPeriods: 3,
    });

    expect(db.batchCalls).toHaveLength(1);
    expect(db.batchCalls[0]).toHaveLength(3);
  });
});
