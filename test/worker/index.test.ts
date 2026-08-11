import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../../src/worker/index";

class FakeStatement {
  constructor(private readonly faviconUrl: string | null = null) {}

  bind() {
    return this;
  }

  async first<T>() {
    if (this.faviconUrl) {
      return { favicon_url: this.faviconUrl } as T;
    }
    return null as T | null;
  }
}

class FakeD1 {
  constructor(private readonly faviconUrl: string | null = null) {}

  prepare() {
    return new FakeStatement(this.faviconUrl);
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

function createFaviconEnv(faviconUrl: string | null) {
  return {
    DB: new FakeD1(faviconUrl),
    ASSETS: {
      fetch: async (request: Request) =>
        new Response(`asset:${new URL(request.url).pathname}`),
    },
  } as unknown as Env;
}

function createCanonicalAssetsEnv(overrides: Partial<Env> = {}) {
  return {
    DB: new FakeD1(),
    ASSETS: {
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === "/admin/index.html") {
          return Response.redirect(`${url.origin}/admin/`, 307);
        }
        return new Response(`asset:${url.pathname}`);
      },
    },
    ...overrides,
  } as unknown as Env;
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

describe("worker fetch handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves assets normally for non-admin paths", async () => {
    const request = new Request(
      "http://example.com/favicon.png"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/favicon.png");
  });

  it("serves configured favicon url before static assets", async () => {
    const remoteFavicon = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async () =>
      new Response(remoteFavicon, {
        headers: { "Content-Type": "image/png" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request(
      "http://example.com/favicon.ico"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createFaviconEnv("https://cdn.example.com/favicon.png"),
      executionContext
    );

    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/favicon.png");
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.arrayBuffer()).resolves.toEqual(
      remoteFavicon.buffer
    );
  });

  it("keeps static favicon when no favicon url is configured", async () => {
    const request = new Request(
      "http://example.com/favicon.ico"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createFaviconEnv(null),
      executionContext
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/favicon.ico");
  });

  it("serves the admin shell for /admin by default", async () => {
    const request = new Request(
      "http://example.com/admin"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(request, createEnv(), executionContext);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/");
  });

  it("serves the admin shell for /admin/ without index redirect loops", async () => {
    const request = new Request(
      "http://example.com/admin/"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createCanonicalAssetsEnv(),
      executionContext
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/");
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
    await expect(response.text()).resolves.toBe("asset:/admin/");
  });

  it("normalizes ADMIN_PATH with a trailing slash", async () => {
    const request = new Request(
      "http://example.com/ops/settings"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createEnv({ ADMIN_PATH: "/ops/" } as Partial<Env>),
      executionContext
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/");
  });

  it("matches the canonical admin path when ADMIN_PATH has a trailing slash", async () => {
    const request = new Request(
      "http://example.com/admin"
    ) as unknown as Parameters<typeof worker.fetch>[0];

    const response = await worker.fetch(
      request,
      createEnv({ ADMIN_PATH: "/admin/" } as Partial<Env>),
      executionContext
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset:/admin/");
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
