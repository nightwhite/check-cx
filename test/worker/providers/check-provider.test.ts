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

type FetchCall = [string, RequestInit];

function getFetchCall(fetcher: ReturnType<typeof vi.fn>): FetchCall {
  const call = fetcher.mock.calls[0];
  if (!call) {
    throw new Error("expected fetcher to be called");
  }
  return call as FetchCall;
}

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

  it("lets custom request headers override provider auth headers", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "8" } }] })
    );

    await checkProvider(
      {
        ...baseConfig,
        requestHeaders: {
          Authorization: "Bearer custom-token",
        },
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [, init] = getFetchCall(fetcher);
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer custom-token");
  });

  it("prevents metadata from overriding generated Anthropic challenge fields", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ content: [{ type: "text", text: "8" }] })
    );

    await checkProvider(
      {
        ...baseConfig,
        type: "anthropic",
        model: "claude-3-5-haiku",
        metadata: {
          model: "wrong-model",
          max_tokens: 99,
          messages: [{ role: "user", content: "wrong prompt" }],
          temperature: 0,
        },
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [, init] = getFetchCall(fetcher);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "claude-3-5-haiku",
      max_tokens: 1,
      messages: [{ role: "user", content: challenge.prompt }],
      temperature: 0,
    });
  });

  it("prevents metadata from overriding generated Gemini challenge fields", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "8" }] } }],
      })
    );

    await checkProvider(
      {
        ...baseConfig,
        type: "gemini",
        endpoint:
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        model: "gemini-pro",
        metadata: {
          contents: [{ role: "user", parts: [{ text: "wrong prompt" }] }],
          generationConfig: { maxOutputTokens: 99 },
          safetySettings: [],
        },
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [, init] = getFetchCall(fetcher);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: challenge.prompt }] }],
      generationConfig: { maxOutputTokens: 1 },
      safetySettings: [],
    });
  });

  it("strips model reasoning directives for OpenAI request bodies", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "8" } }] })
    );

    await checkProvider(
      {
        ...baseConfig,
        model: "o1@high",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [, init] = getFetchCall(fetcher);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("o1");
    expect(body.reasoning_effort).toBe("high");
  });

  it("uses OpenAI-compatible formatting for non-Google Gemini endpoints", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "8" } }] })
    );

    await checkProvider(
      {
        ...baseConfig,
        type: "gemini",
        endpoint: "https://gateway.example/v1/chat/completions",
        model: "gemini-2.5-pro",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [url, init] = getFetchCall(fetcher);
    const headers = init.headers as Headers;
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(headers.get("authorization")).toBe("Bearer secret");
    expect(body).toMatchObject({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: challenge.prompt }],
      max_tokens: 1,
    });
    expect(body.contents).toBeUndefined();
  });
});
