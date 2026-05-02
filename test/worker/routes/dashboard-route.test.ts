import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../src/worker/app";

interface SnapshotRow {
  payload_json: string;
  etag: string;
  generated_at_ms: number;
}

class FakeStatement {
  constructor(
    private readonly row: SnapshotRow | null,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.row, values);
  }

  async first<T>() {
    if (this.values[0] === "dashboard" && this.values[1] === "7d") {
      return this.row as T | null;
    }
    return null;
  }

  async all<T>() {
    return { results: [] as T[] };
  }
}

class FakeD1 {
  constructor(private readonly row: SnapshotRow | null) {}

  prepare() {
    return new FakeStatement(this.row);
  }
}

function createEnv(row: SnapshotRow | null) {
  return {
    DB: new FakeD1(row),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

describe("dashboard route", () => {
  it("serves dashboard snapshot data with ETag", async () => {
    const app = createWorkerApp();
    const env = createEnv({
      payload_json: JSON.stringify({ total: 1, providerTimelines: [] }),
      etag: "\"abc\"",
      generated_at_ms: 1_000,
    });

    const response = await app.request(
      "http://example.com/api/dashboard?trendPeriod=7d",
      {},
      env
    );

    await expect(response.json()).resolves.toEqual({
      total: 1,
      providerTimelines: [],
    });
    expect(response.headers.get("ETag")).toBe("\"abc\"");
  });

  it("returns 304 when If-None-Match matches snapshot ETag", async () => {
    const app = createWorkerApp();
    const response = await app.request(
      "http://example.com/api/dashboard?trendPeriod=7d",
      { headers: { "If-None-Match": "\"abc\"" } },
      createEnv({
        payload_json: JSON.stringify({ total: 1 }),
        etag: "\"abc\"",
        generated_at_ms: 1_000,
      })
    );

    expect(response.status).toBe(304);
  });

  it("rejects invalid trendPeriod", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/dashboard?trendPeriod=90d",
      {},
      createEnv(null)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_trend_period",
      allowed: ["7d", "15d", "30d"],
    });
  });
});
