import { describe, expect, it, vi } from "vitest";

import { checkProvider } from "../../../src/worker/providers/check-provider";
import type { WorkerProviderConfig } from "../../../src/worker/providers/types";

const baseConfig: WorkerProviderConfig = {
  id: "config-1",
  name: "OpenAI",
  type: "openai",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  apiKey: "secret",
  isMaintenance: false,
};

const challenge = {
  prompt: "1 + 7 = ?",
  expectedAnswer: "8",
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });

describe("checkProvider", () => {
  it("returns operational when provider response passes challenge validation", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "8" } }] })
    );

    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher,
      measurePing: async () => 12,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
    expect(result.latencyMs).toBe(0);
    expect(result.pingLatencyMs).toBe(12);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns failed when provider response is not ok", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () => jsonResponse({ error: "bad" }, { status: 500 }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("500");
  });

  it("returns validation_failed when provider response misses the expected answer", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ choices: [{ message: { content: "9" } }] }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("validation_failed");
  });

  it("returns failed when fetch throws", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () => {
        throw new Error("network down");
      },
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("network down");
  });

  it("skips provider request in maintenance mode", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}));

    const result = await checkProvider(
      { ...baseConfig, isMaintenance: true },
      {
        challenge,
        fetcher,
        measurePing: async () => 20,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("maintenance");
    expect(result.pingLatencyMs).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
