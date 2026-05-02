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
  constructor(private readonly rows: ProviderStatusRow[]) {}

  async all<T>() {
    return { results: this.rows as T[] };
  }
}

class FakeD1 {
  constructor(private readonly rows: ProviderStatusRow[]) {}

  prepare() {
    return new FakeStatement(this.rows);
  }
}

function createEnv(rows: ProviderStatusRow[]) {
  return {
    DB: new FakeD1(rows),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

describe("status route", () => {
  it("forces latest status to maintenance when config is in maintenance mode", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/v1/status",
      {},
      createEnv([
        {
          id: "cfg-1",
          name: "OpenAI",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          group_name: "core",
          is_maintenance: 1,
          model: "gpt-4o-mini",
          status: "operational",
          latency_ms: 120,
          ping_latency_ms: 12,
          checked_at_ms: 1_775_174_400_000,
          message: "OK",
        },
      ])
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
});
