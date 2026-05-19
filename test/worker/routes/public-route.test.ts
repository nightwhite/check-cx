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
  lastQuery = "";

  constructor(private readonly row: SnapshotRow | null) {}

  prepare(query: string) {
    this.lastQuery = query;
    return new FakeStatement(this.row);
  }
}

function createEnv(db: FakeD1) {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

function createSnapshotPayload() {
  return {
    providerTimelines: [
      {
        id: "cfg-openai",
        latest: {
          id: "cfg-openai",
          name: "OpenAI GPT-4o",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o",
          groupName: "core",
          status: "operational",
          latencyMs: 320,
          pingLatencyMs: 20,
          checkedAt: "2026-05-20T00:00:00.000Z",
          message: "OK",
        },
        items: [],
      },
      {
        id: "cfg-gemini",
        latest: {
          id: "cfg-gemini",
          name: "Gemini Flash",
          type: "gemini",
          endpoint: "https://generativelanguage.googleapis.com",
          model: "gemini-2.5-flash",
          groupName: "edge",
          status: "degraded",
          latencyMs: 7_200,
          pingLatencyMs: null,
          checkedAt: "2026-05-20T00:01:00.000Z",
          message: "Slow response",
        },
        items: [],
      },
    ],
    groupInfos: [],
    lastUpdated: "2026-05-20T00:01:00.000Z",
    total: 2,
    pollIntervalLabel: "60 秒",
    pollIntervalMs: 60_000,
    availabilityStats: {
      "cfg-openai": [
        { period: "7d", totalChecks: 10, operationalCount: 10, availabilityPct: 100 },
        { period: "15d", totalChecks: 20, operationalCount: 19, availabilityPct: 95 },
      ],
      "cfg-gemini": [
        { period: "7d", totalChecks: 10, operationalCount: 8, availabilityPct: 80 },
      ],
    },
    trendPeriod: "7d",
    generatedAt: 1_779_235_260_000,
  };
}

function createDb(row: SnapshotRow | null) {
  return new FakeD1(row);
}

describe("public status routes", () => {
  it("serves sanitized public status JSON with CORS and cache validators", async () => {
    const app = createWorkerApp();
    const db = createDb({
      payload_json: JSON.stringify(createSnapshotPayload()),
      etag: "\"dashboard-etag\"",
      generated_at_ms: 1_779_235_260_000,
    });

    const response = await app.request(
      "http://example.com/api/public/status?period=7d",
      {},
      createEnv(db)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("ETag")).toMatch(/^".+"$/);
    expect(response.headers.get("Cache-Control")).toContain("public");

    await expect(response.json()).resolves.toEqual({
      version: 1,
      generatedAt: "2026-05-20T00:01:00.000Z",
      period: "7d",
      overallStatus: "degraded",
      summary: {
        total: 2,
        operational: 1,
        degraded: 1,
        failed: 0,
        maintenance: 0,
        unknown: 0,
      },
      providers: [
        {
          id: "cfg-openai",
          name: "OpenAI GPT-4o",
          type: "openai",
          model: "gpt-4o",
          group: "core",
          status: "operational",
          latencyMs: 320,
          checkedAt: "2026-05-20T00:00:00.000Z",
          message: "OK",
          availability: {
            "7d": 100,
            "15d": 95,
          },
        },
        {
          id: "cfg-gemini",
          name: "Gemini Flash",
          type: "gemini",
          model: "gemini-2.5-flash",
          group: "edge",
          status: "degraded",
          latencyMs: 7_200,
          checkedAt: "2026-05-20T00:01:00.000Z",
          message: "Slow response",
          availability: {
            "7d": 80,
          },
        },
      ],
    });
    expect(db.lastQuery).toContain("FROM dashboard_snapshots");
    expect(db.lastQuery).not.toContain("check_history");
  });

  it("returns 304 for matching public status ETag", async () => {
    const app = createWorkerApp();
    const env = createEnv(
      createDb({
        payload_json: JSON.stringify(createSnapshotPayload()),
        etag: "\"dashboard-etag\"",
        generated_at_ms: 1_779_235_260_000,
      })
    );
    const initial = await app.request(
      "http://example.com/api/public/status?period=7d",
      {},
      env
    );
    const etag = initial.headers.get("ETag") ?? "";

    const response = await app.request(
      "http://example.com/api/public/status?period=7d",
      { headers: { "If-None-Match": etag } },
      env
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("ETag")).toBe(etag);
  });

  it("serves an unknown empty public status when no snapshot exists", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/public/status",
      {},
      createEnv(createDb(null))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: 1,
      period: "7d",
      overallStatus: "unknown",
      summary: {
        total: 0,
      },
      providers: [],
    });
  });

  it("rejects invalid public status periods", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/public/status?period=90d",
      {},
      createEnv(createDb(null))
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_period",
      allowed: ["7d", "15d", "30d"],
    });
  });

  it("serves an embeddable SVG status card", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/public/status-card.svg?period=7d",
      {},
      createEnv(
        createDb({
          payload_json: JSON.stringify(createSnapshotPayload()),
          etag: "\"dashboard-etag\"",
          generated_at_ms: 1_779_235_260_000,
        })
      )
    );

    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "image/svg+xml; charset=utf-8"
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("ETag")).toMatch(/^".+"$/);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Check CX Status");
    expect(svg).toContain("Degraded");
    expect(svg).toContain("OpenAI GPT-4o");
    expect(svg).not.toContain("https://api.openai.com");
  });

  it("returns 304 for matching SVG card ETag", async () => {
    const app = createWorkerApp();
    const env = createEnv(
      createDb({
        payload_json: JSON.stringify(createSnapshotPayload()),
        etag: "\"dashboard-etag\"",
        generated_at_ms: 1_779_235_260_000,
      })
    );
    const initial = await app.request(
      "http://example.com/api/public/status-card.svg?period=7d",
      {},
      env
    );
    const etag = initial.headers.get("ETag") ?? "";

    const response = await app.request(
      "http://example.com/api/public/status-card.svg?period=7d",
      { headers: { "If-None-Match": etag } },
      env
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe(etag);
  });
});
