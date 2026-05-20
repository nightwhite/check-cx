import { describe, expect, it } from "vitest";

import worker from "../../src/worker/index";

class FakeStatement {
  bind() {
    return this;
  }

  async first<T>() {
    return null as T | null;
  }
}

class FakeD1 {
  prepare() {
    return new FakeStatement();
  }
}

function createEnv(overrides: Partial<Env> = {}) {
  return {
    DB: new FakeD1(),
    ASSETS: {
      fetch: async (request: Request) =>
        new Response(`asset:${new URL(request.url).pathname}`),
    },
    ...overrides,
  } as unknown as Env;
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

describe("worker fetch handler", () => {
  it("serves assets normally for non-admin paths", async () => {
    const request = new Request(
      "http://example.com/favicon.png"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/favicon.png");
  });

  it("serves the admin shell for /admin by default", async () => {
    const request = new Request(
      "http://example.com/admin"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/index.html");
  });

  it("serves the admin shell for ADMIN_PATH when configured", async () => {
    const request = new Request(
      "http://example.com/ops/settings"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createEnv({ ADMIN_PATH: "/ops" } as Partial<Env>),
      executionContext
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/index.html");
  });

  it("redirects the legacy SU8 group route to the canonical status page", async () => {
    const request = new Request(
      "http://example.com/group/SU8"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("http://example.com/");
  });

  it("does not replace intentional API 404 responses with static assets", async () => {
    const request = new Request(
      "http://example.com/api/group/missing?trendPeriod=7d"
    ) as unknown as Parameters<typeof worker.fetch>[0];
    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "分组不存在或没有配置",
    });
  });
});
