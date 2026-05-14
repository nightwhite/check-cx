import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../src/worker/app";

class FakeStatement {
  constructor(private readonly query: string) {}

  async first<T>() {
    if (this.query.includes("COUNT(*)")) {
      return { count: 7 } as T;
    }
    return { ok: 1 } as T;
  }
}

class FakeD1 {
  prepare(query: string) {
    return new FakeStatement(query);
  }
}

function createEnv(token?: string) {
  return {
    DB: new FakeD1(),
    ASSETS: { fetch: async () => new Response("asset") },
    INTERNAL_METRICS_TOKEN: token,
  } as unknown as Env;
}

describe("internal db health route", () => {
  it("rejects requests without the internal token", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/internal/db-health",
      {},
      createEnv("secret")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns db health when the internal token matches", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/internal/db-health",
      { headers: { "x-internal-token": "secret" } },
      createEnv("secret")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns authenticated cache metrics compatibility data", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/internal/cache-metrics",
      { headers: { "x-internal-token": "secret" } },
      createEnv("secret")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workerRuntime: "cloudflare-workers",
      dashboardSnapshots: {
        count: 7,
      },
      combinedDbCache: {
        hits: 0,
        misses: 0,
      },
    });
  });
});
