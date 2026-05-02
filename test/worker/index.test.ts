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

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

describe("worker fetch handler", () => {
  it("does not replace intentional API 404 responses with static assets", async () => {
    const env = {
      DB: new FakeD1(),
      ASSETS: { fetch: async () => new Response("asset") },
    } as unknown as Env;

    const request = new Request(
      "http://example.com/api/group/missing?trendPeriod=7d"
    ) as unknown as Parameters<typeof worker.fetch>[0];
    const response = await worker.fetch(request, env, executionContext);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "分组不存在或没有配置",
    });
  });
});
