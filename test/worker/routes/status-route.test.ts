import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../src/worker/app";

interface ProviderStatusRow {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  group_name: string | null;
  is_maintenance: number;
  model: string | null;
  status: string | null;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at_ms: number | null;
  message: string | null;
}

class FakeStatement {
  constructor(
    private readonly db: FakeD1,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    this.db.lastBindValues = values;
    return new FakeStatement(this.db, values);
  }

  async all<T>() {
    const [groupFilter, modelFilter] = this.values;
    const rows = this.db.rows
      .filter((row) => !groupFilter || row.group_name === groupFilter)
      .filter((row) => !modelFilter || row.model === modelFilter);
    return { results: rows as T[] };
  }
}

class FakeD1 {
  lastQuery = "";
  lastBindValues: unknown[] = [];

  constructor(readonly rows: ProviderStatusRow[]) {}

  prepare(query: string) {
    this.lastQuery = query;
    return new FakeStatement(this);
  }
}

function createEnv(db: FakeD1) {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

function createRow(overrides: Partial<ProviderStatusRow> = {}): ProviderStatusRow {
  return {
    id: "cfg-1",
    name: "OpenAI",
    type: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    group_name: "core",
    is_maintenance: 0,
    model: "gpt-4o-mini",
    status: "operational",
    latency_ms: 120,
    ping_latency_ms: 12,
    checked_at_ms: 1_775_174_400_000,
    message: "OK",
    ...overrides,
  };
}

describe("status route", () => {
  it("forces latest status to maintenance when config is in maintenance mode", async () => {
    const app = createWorkerApp();
    const db = new FakeD1([
      createRow({
        is_maintenance: 1,
      }),
    ]);

    const response = await app.request(
      "http://example.com/api/v1/status",
      {},
      createEnv(db)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providers: [
        {
          id: "cfg-1",
          latest: {
            status: "maintenance",
            latencyMs: 120,
            pingLatencyMs: 12,
          },
        },
      ],
      summary: {
        total: 1,
        operational: 0,
        maintenance: 1,
      },
    });
  });

  it("pushes group and model filters into the D1 query", async () => {
    const app = createWorkerApp();
    const db = new FakeD1([
      createRow({ id: "cfg-1", group_name: "core", model: "gpt-4o-mini" }),
      createRow({ id: "cfg-2", group_name: "edge", model: "claude-3-5-haiku" }),
    ]);

    const response = await app.request(
      "http://example.com/api/v1/status?group=core&model=gpt-4o-mini",
      {},
      createEnv(db)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providers: [{ id: "cfg-1" }],
      summary: { total: 1 },
    });
    expect(db.lastQuery).toContain("(?1 IS NULL OR c.group_name = ?1)");
    expect(db.lastQuery).toContain("(?2 IS NULL OR m.model = ?2)");
    expect(db.lastBindValues).toEqual(["core", "gpt-4o-mini"]);
  });
});
