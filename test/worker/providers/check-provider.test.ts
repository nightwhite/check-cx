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

const textStreamResponse = (
  chunks: string[],
  onChunk?: (index: number) => void
) => {
  const encoder = new TextEncoder();
  let index = 1;
  return new Response(
    new ReadableStream({
      start(controller) {
        onChunk?.(0);
        controller.enqueue(encoder.encode(chunks[0]));
      },
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        onChunk?.(index);
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }
  );
};

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

  it.each([
    [30_000, "operational"],
    [30_001, "degraded"],
  ])("uses 30 seconds as the degraded threshold", async (latencyMs, status) => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000 + latencyMs);

    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ choices: [{ message: { content: "8" } }] }),
      measurePing: async () => null,
      now,
    });

    expect(result.latencyMs).toBe(latencyMs);
    expect(result.status).toBe(status);
  });

  it("preserves channel metadata in check results", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "8" } }] })
    );

    const result = await checkProvider(
      {
        ...baseConfig,
        channelId: "codex",
        channelName: "Codex",
        channelLogoUrl: "https://example.com/logo.png",
        region: "cn2",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => 12,
        now: () => 1_000,
      }
    );

    expect(result.channelId).toBe("codex");
    expect(result.channelName).toBe("Codex");
    expect(result.channelLogoUrl).toBe("https://example.com/logo.png");
    expect(result.region).toBe("cn2");
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

  it("strips model directives without adding reasoning request fields", async () => {
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
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it("uses Responses input messages without reasoning fields", async () => {
    const fetcher = vi.fn(async () =>
      textStreamResponse([
        'data: {"type":"response.output_item.added","item":{"type":"reasoning"}}\n\n',
        'data: {"type":"response.output_text.delta","delta":"8"}\n\n',
        'data: {"type":"response.output_text.done","text":"8"}\n\n',
        'data: {"type":"response.completed"}\n\n',
      ])
    );

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.5",
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
      model: "gpt-5.5",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: challenge.prompt }],
        },
      ],
      max_output_tokens: 1,
      stream: true,
    });
    expect(body.messages).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("8");
  });

  it("measures Responses latency from the first streamed response chunk", async () => {
    let nowMs = 1_000;
    const fetcher = vi.fn(async () => {
      nowMs = 2_200;
      return textStreamResponse(
        [
          'data: {"type":"response.output_text.delta","delta":"8"}\n\n',
          'data: {"type":"response.output_text.done","text":"8"}\n\n',
        ]
      );
    });

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.5",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => nowMs,
      }
    );

    const [, init] = getFetchCall(fetcher);
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(true);
    expect(result.latencyMs).toBe(1_200);
    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("8");
  });

  it("parses Responses stream events with multi-line data fields", async () => {
    const fetcher = vi.fn(async () =>
      textStreamResponse([
        'data: {"type":"response.output_text.delta",\n',
        'data: "delta":"8"}\n\n',
      ])
    );

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.5",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("8");
  });

  it("returns a clear failure for malformed Responses stream events", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.5",
      },
      {
        challenge,
        fetcher: async () => textStreamResponse(["data: {not-json}\n\n"]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.message).toContain("Malformed Responses stream event");
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

  it("aborts provider requests when timeoutMs is reached", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        })
    );

    const promise = checkProvider(baseConfig, {
      challenge,
      fetcher,
      measurePing: async () => null,
      now: () => 1_000,
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    const result = await promise;

    expect(result.status).toBe("failed");
    expect(result.message).toContain("aborted");
    vi.useRealTimers();
  });

  it("uses non-streaming Gemini endpoint for streamGenerateContent configs", async () => {
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
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent",
        model: "gemini-pro",
      },
      {
        challenge,
        fetcher,
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    const [url] = getFetchCall(fetcher);
    expect(url).toContain(":generateContent");
    expect(url).not.toContain(":streamGenerateContent");
  });
});
