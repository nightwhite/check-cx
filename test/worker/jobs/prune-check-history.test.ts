import { describe, expect, it } from "vitest";

import { pruneCheckHistory } from "../../../src/worker/jobs/prune-check-history";
import type { D1Executor, D1StatementLike } from "../../../src/worker/db/repositories";

class FakeStatement implements D1StatementLike {
  constructor(
    private readonly db: FakeD1,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, values);
  }

  async first<T>() {
    return null as T | null;
  }

  async run() {
    const cutoff = Number(this.values[0]);
    let changes = 0;
    for (const [id, checkedAtMs] of this.db.rows) {
      if (checkedAtMs < cutoff) {
        this.db.rows.delete(id);
        changes++;
      }
    }
    return { meta: { changes } };
  }
}

class FakeD1 implements D1Executor {
  readonly rows = new Map<string, number>([
    ["old", 100],
    ["new", 2 * 24 * 60 * 60 * 1000],
  ]);

  prepare() {
    return new FakeStatement(this);
  }
}

describe("pruneCheckHistory", () => {
  it("deletes history rows older than the retention window", async () => {
    const db = new FakeD1();

    await expect(
      pruneCheckHistory(db, 2 * 24 * 60 * 60 * 1000, 1)
    ).resolves.toBe(1);
    expect([...db.rows.keys()]).toEqual(["new"]);
  });
});
