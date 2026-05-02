import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { exportTable, type SupabaseLike } from "../../scripts/migration/export-supabase";

class FakeQuery {
  constructor(
    private readonly rows: Array<Record<string, unknown>>,
    private readonly ranges: Array<[number, number]>
  ) {}

  select() {
    return this;
  }

  gte() {
    return this;
  }

  order() {
    return this;
  }

  async range(from: number, to: number) {
    this.ranges.push([from, to]);
    return {
      data: this.rows.slice(from, to + 1),
      error: null,
    };
  }
}

class FakeSupabase implements SupabaseLike {
  readonly ranges: Array<[number, number]> = [];

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  from() {
    return new FakeQuery(this.rows, this.ranges);
  }
}

describe("exportTable", () => {
  it("paginates Supabase rows until the final partial page", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-cx-export-"));
    const client = new FakeSupabase([
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
      { id: 5 },
    ]);

    try {
      await exportTable(dir, "check_history", client, {
        pageSize: 2,
        nowMs: Date.parse("2026-05-02T00:00:00.000Z"),
      });

      const jsonl = await readFile(join(dir, "check_history.jsonl"), "utf8");
      expect(jsonl.trim().split("\n")).toHaveLength(5);
      expect(client.ranges).toEqual([
        [0, 1],
        [2, 3],
        [4, 5],
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
