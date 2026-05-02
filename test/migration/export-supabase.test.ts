import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { exportTable, type SupabaseLike } from "../../scripts/migration/export-supabase";

class FakeQuery {
  constructor(
    private readonly rows: Array<Record<string, unknown>>,
    private readonly ranges: Array<[number, number]>,
    private readonly onRange?: (from: number) => Promise<void>
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
    await this.onRange?.(from);
    this.ranges.push([from, to]);
    return {
      data: this.rows.slice(from, to + 1),
      error: null,
    };
  }
}

class FakeSupabase implements SupabaseLike {
  readonly ranges: Array<[number, number]> = [];

  constructor(
    private readonly rows: Array<Record<string, unknown>>,
    private readonly onRange?: (from: number) => Promise<void>
  ) {}

  from() {
    return new FakeQuery(this.rows, this.ranges, this.onRange);
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

  it("writes each page before fetching the next one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-cx-export-"));
    let firstPageWrittenBeforeSecondFetch = false;
    const client = new FakeSupabase(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      async (from) => {
        if (from === 2) {
          const jsonl = await readFile(join(dir, "check_configs.jsonl"), "utf8")
            .catch(() => "");
          firstPageWrittenBeforeSecondFetch = jsonl.includes("\"id\":1");
        }
      }
    );

    try {
      await exportTable(dir, "check_configs", client, { pageSize: 2 });

      expect(firstPageWrittenBeforeSecondFetch).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
