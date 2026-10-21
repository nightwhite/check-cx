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
  prompt: "hi",
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
    expect(result.message).toContain("上游内部错误");
    expect(result.logMessage).toContain(
      "POST https://api.openai.com/v1/chat/completions"
    );
    expect(result.logMessage).toContain("HTTP 500");
    expect(result.logMessage).toContain("content-type: application/json");
    expect(result.logMessage).toContain('{"error":"bad"}');
  });

  it("explains upstream 521 errors and captures response headers", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        new Response("error code: 521", {
          status: 521,
          headers: {
            "content-type": "text/plain",
            "cf-ray": "test-ray",
            "set-cookie": "should-not-appear",
          },
        }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("521");
    expect(result.message).toContain("上游源站不可达");
    expect(result.logMessage).toContain("HTTP 521");
    expect(result.logMessage).toContain("cf-ray: test-ray");
    expect(result.logMessage).toContain("error code: 521");
    expect(result.logMessage).toContain("Cloudflare 无法连接到上游源站");
    expect(result.logMessage).not.toContain("set-cookie");
  });

  it("includes the underlying cause when fetch fails", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () => {
        const error = new Error("fetch failed");
        (error as Error & { cause?: unknown }).cause = new Error(
          "connect ECONNREFUSED"
        );
        throw error;
      },
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("fetch failed");
    expect(result.message).toContain("ECONNREFUSED");
    expect(result.logMessage).toContain("ECONNREFUSED");
  });

  it("returns validation_failed when provider response is empty", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ choices: [{ message: { content: "" } }] }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("validation_failed");
  });

  it("logs the raw body when the reply is empty without generated tokens", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({
          choices: [{ message: { content: "" }, finish_reason: "stop" }],
          usage: { completion_tokens: 0 },
        }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("validation_failed");
    expect(result.message).toBe("响应为空");
    expect(result.logMessage).toContain('"finish_reason":"stop"');
  });

  it("treats empty content with generated reasoning tokens as operational", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({
          choices: [{ message: { content: "" }, finish_reason: "length" }],
          usage: {
            completion_tokens: 32,
            completion_tokens_details: { reasoning_tokens: 32 },
          },
        }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
    expect(result.message).toBe("OK");
    expect(result.logMessage).toContain("32 个输出 token");
  });

  it("treats a truncated reply without usage as operational", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({
          choices: [{ message: { content: null }, finish_reason: "length" }],
        }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
  });

  it("treats Responses streams that only produced reasoning tokens as operational", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "deepseek-v4-1-flash",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            'data: {"type":"response.output_item.added","item":{"type":"reasoning"}}\n\n',
            'data: {"type":"response.incomplete","response":{"status":"incomplete",' +
              '"incomplete_details":{"reason":"max_output_tokens"},' +
              '"usage":{"output_tokens":32,"output_tokens_details":{"reasoning_tokens":32}}}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("operational");
    expect(result.logMessage).toContain("32 个输出 token");
  });

  it("uses final text from done events when the stream has no deltas", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.6-terra",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            ": keepalive\n\n",
            'event: response.created\ndata: {"type":"response.created","response":{"status":"in_progress","output":[]}}\n\n',
            'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","role":"assistant","content":[]}}\n\n',
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Hello!"}]}}\n\n',
            'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("Hello!");
  });

  it("logs the event sequence and stream tail when a long stream is empty", async () => {
    const padding = "x".repeat(2_000);
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.6-terra",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            `data: {"type":"response.created","response":{"status":"in_progress","instructions":"${padding}"}}\n\n`,
            'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}\n\n',
            'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}\n\n',
            'data: {"type":"response.completed","response":{"status":"completed","end_marker":"tail-visible"}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("validation_failed");
    expect(result.logMessage).toContain(
      "事件序列: response.created → response.output_item.added×2 → response.completed"
    );
    expect(result.logMessage).toContain("tail-visible");
    expect(result.logMessage!.length).toBeLessThanOrEqual(2400);
  });

  it("treats response.failed events in a 200 stream as failed with the upstream error", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "gpt-5.6-terra",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            'event: response.created\ndata: {"type":"response.created","response":{"status":"in_progress","output":[]}}\n\n',
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":""}\n\n',
            'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":""}\n\n',
            'event: response.metadata\ndata: {"type":"response.metadata"}\n\n',
            'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed",' +
              '"error":{"code":"server_error","message":"Our servers are currently overloaded. Please try again later.","type":"service_unavailable_error"}}}\n\n',
            'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed",' +
              '"error":{"code":"upstream_error","message":"codex upstream failed"}}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.message).toBe(
      "上游返回错误：server_error: Our servers are currently overloaded. Please try again later."
    );
    expect(result.logMessage).toContain("response.failed×2");
    expect(result.logMessage).toContain("codex upstream failed");
  });

  it("treats a failed stream as failed even after partial text", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            'data: {"type":"response.output_text.delta","delta":"Hel"}\n\n',
            'data: {"type":"error","error":{"type":"server_error","message":"stream interrupted"}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.message).toBe("上游返回错误：server_error: stream interrupted");
  });

  it("treats a 200 JSON body with an error object as failed", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ error: { code: "upstream_error", message: "codex upstream failed" } }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe("上游返回错误：upstream_error: codex upstream failed");
  });

  it("ignores null error fields on successful replies", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ error: null, choices: [{ message: { content: "hi" } }] }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
  });

  it("logs the raw stream when a Responses stream has no text or tokens", async () => {
    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "https://api.openai.com/v1/responses",
        apiFormat: "responses",
        model: "deepseek-v4-1-flash",
      },
      {
        challenge,
        fetcher: async () =>
          textStreamResponse([
            'data: {"type":"response.completed","response":{"status":"completed","usage":{"output_tokens":0}}}\n\n',
          ]),
        measurePing: async () => null,
        now: () => 1_000,
      }
    );

    expect(result.status).toBe("validation_failed");
    expect(result.logMessage).toContain("response.completed");
  });

  it("accepts reasoning_content when message content is empty", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({
          choices: [
            { message: { content: "", reasoning_content: "thinking" } },
          ],
        }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("thinking");
  });

  it("returns operational for any non-empty reply", async () => {
    const result = await checkProvider(baseConfig, {
      challenge,
      fetcher: async () =>
        jsonResponse({ choices: [{ message: { content: "ping" } }] }),
      measurePing: async () => null,
      now: () => 1_000,
    });

    expect(result.status).toBe("operational");
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

  it("returns error without requesting when config credentials cannot be resolved", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}));
    const measurePing = vi.fn(async () => 20);

    const result = await checkProvider(
      { ...baseConfig, endpoint: "", apiKey: "", configError: "渠道未配置 Base URL" },
      {
        challenge,
        fetcher,
        measurePing,
        now: () => 1_000,
      }
    );

    expect(result).toMatchObject({
      status: "error",
      message: "渠道未配置 Base URL",
      latencyMs: null,
      pingLatencyMs: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(measurePing).not.toHaveBeenCalled();
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
      max_tokens: 32,
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
      generationConfig: { maxOutputTokens: 32 },
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

  it("uses Responses input messages with low reasoning effort", async () => {
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
      max_output_tokens: 32,
      reasoning: { effort: "low" },
      stream: true,
    });
    expect(body.messages).toBeUndefined();
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

  it("parses proxy-mangled SSE blocks containing multiple complete events", async () => {
    const fetcher = vi.fn(async () =>
      textStreamResponse([
        // 代理注入 ping 并吞掉分隔符后，同一块内挤进两条完整 data 行
        'data: {"type":"response.output_text.delta","delta":"Hi."}\n' +
          'data: {"type":"response.output_text.delta","delta":" How can I help?"}\n\n',
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
    expect(result.logMessage).toBe("Hi. How can I help?");
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
      max_tokens: 32,
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

  it("direct TCP mode sends the custom Host header and returns operational", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let sent = "";
    const socket = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n' +
                'data: {"type":"response.output_text.delta","delta":"Hi."}\n\n'
            )
          );
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          sent += decoder.decode(chunk);
        },
      }),
      close() {},
    };

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "http://152.53.240.240/v1/responses",
        hostHeader: "www.example.com",
        apiFormat: "responses",
      },
      {
        challenge,
        measurePing: async () => null,
        now: () => 1_000,
        openSocket: () => socket,
      }
    );

    expect(sent).toContain("Host: www.example.com");
    expect(sent).toContain("POST /v1/responses HTTP/1.1");
    expect(sent).toContain("authorization: Bearer secret");
    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("Hi.");
  });

  it("direct TCP mode reports provider HTTP failures", async () => {
    const encoder = new TextEncoder();
    const socket = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\n\r\n' +
                '{"error":{"code":"endpoint_unavailable"}}'
            )
          );
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close() {},
    };

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "http://152.53.240.240/v1/responses",
        hostHeader: "www.example.com",
      },
      {
        challenge,
        measurePing: async () => null,
        now: () => 1_000,
        openSocket: () => socket,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.message).toContain("404");
  });

  it("direct TCP mode returns validation_failed for empty replies", async () => {
    const encoder = new TextEncoder();
    const socket = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n' +
                '{"choices":[{"message":{"content":""}}]}'
            )
          );
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close() {},
    };

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "http://152.53.240.240/v1/chat/completions",
        hostHeader: "www.example.com",
      },
      {
        challenge,
        measurePing: async () => null,
        now: () => 1_000,
        openSocket: () => socket,
      }
    );

    expect(result.status).toBe("validation_failed");
    expect(result.logMessage).toContain("Host: www.example.com");
    expect(result.logMessage).toContain("HTTP/1.1 200 OK");
    expect(result.logMessage).toContain('"content":""');
  });

  it("direct TCP mode decodes chunked SSE responses", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let sent = "";
    const sse =
      'data: {"type":"response.output_text.delta","delta":"Hi."}\n\n' +
      'data: {"type":"response.output_text.delta","delta":" How can I help?"}\n\n';
    // 把 SSE 包进 chunked 帧，帧边界故意落在 SSE 事件中间
    const part1 = sse.slice(0, 40);
    const part2 = sse.slice(40);
    const framed =
      part1.length.toString(16) +
      "\r\n" +
      part1 +
      "\r\n" +
      part2.length.toString(16) +
      "\r\n" +
      part2 +
      "\r\n" +
      "0\r\n\r\n";
    const socket = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n" +
                framed
            )
          );
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          sent += decoder.decode(chunk);
        },
      }),
      close() {},
    };

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "http://152.53.240.240/v1/responses",
        hostHeader: "www.example.com",
        apiFormat: "responses",
      },
      {
        challenge,
        measurePing: async () => null,
        now: () => 1_000,
        openSocket: () => socket,
      }
    );

    expect(sent).toContain("Host: www.example.com");
    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("Hi. How can I help?");
  });

  it("direct TCP mode keeps chunk offsets byte-accurate with multibyte payloads", async () => {
    const encoder = new TextEncoder();
    // 回复里带多字节字符（emoji/中文），chunk 边界落在多字节字符中间
    const sse =
      'data: {"type":"response.output_text.delta","delta":"你好，世界 🌊"}\n\n' +
      'data: {"type":"response.output_text.delta","delta":"！"}\n\n';
    const bytes = encoder.encode(sse);
    // 17 字节为第一块（刻意切在中文/emoji 的字节序列中间）
    const splitAt = 17;
    const part1 = bytes.subarray(0, splitAt);
    const part2 = bytes.subarray(splitAt);
    const framed =
      new TextEncoder().encode(
        part1.length.toString(16) + "\r\n"
      );
    const part2Head = new TextEncoder().encode(
      "\r\n" + part2.length.toString(16) + "\r\n"
    );
    const terminator = new TextEncoder().encode("\r\n0\r\n\r\n");
    const framedBytes = concatUint8([
      framed,
      part1,
      part2Head,
      part2,
      terminator,
    ]);
    const headBytes = new TextEncoder().encode(
      "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n"
    );
    const responseBytes = concatUint8([headBytes, framedBytes]);
    const socket = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(responseBytes);
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close() {},
    };

    const result = await checkProvider(
      {
        ...baseConfig,
        endpoint: "http://152.53.240.240/v1/responses",
        hostHeader: "www.example.com",
        apiFormat: "responses",
      },
      {
        challenge,
        measurePing: async () => null,
        now: () => 1_000,
        openSocket: () => socket,
      }
    );

    expect(result.status).toBe("operational");
    expect(result.logMessage).toBe("你好，世界 🌊！");
  });
});

function concatUint8(list: Uint8Array[]): Uint8Array {
  const total = list.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const item of list) {
    out.set(item, offset);
    offset += item.length;
  }
  return out;
}
