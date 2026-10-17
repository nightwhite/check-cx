import { describe, expect, it, vi } from "vitest";

import {
  buildModelsUrl,
  fetchUpstreamModels,
  inferProviderType,
  parseUpstreamModels,
} from "../../../src/worker/providers/upstream-models";

describe("upstream models", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/v1/models"],
    ["https://api.example.com/", "https://api.example.com/v1/models"],
    ["https://api.example.com/v1", "https://api.example.com/v1/models"],
    [
      "https://generativelanguage.googleapis.com",
      "https://generativelanguage.googleapis.com/v1beta/models",
    ],
    [
      "https://generativelanguage.googleapis.com/v1beta",
      "https://generativelanguage.googleapis.com/v1beta/models",
    ],
  ])("builds the models URL for %s", (baseUrl, expected) => {
    expect(buildModelsUrl(baseUrl)).toBe(expected);
  });

  it("infers provider type from the model name", () => {
    expect(inferProviderType("claude-opus-5-5")).toBe("anthropic");
    expect(inferProviderType("gemini-3-pro")).toBe("gemini");
    expect(inferProviderType("gpt-6-sol")).toBe("openai");
    expect(inferProviderType("deepseek-v4")).toBe("openai");
  });

  it("parses OpenAI-style and Gemini-style lists, deduplicated and sorted", () => {
    expect(
      parseUpstreamModels({
        data: [
          { id: "gpt-6", owned_by: "openai" },
          { id: "claude-opus-5-5" },
          { id: "gpt-6" },
          { id: "" },
        ],
      })
    ).toEqual([
      { id: "claude-opus-5-5", type: "anthropic", ownedBy: null },
      { id: "gpt-6", type: "openai", ownedBy: "openai" },
    ]);
    expect(
      parseUpstreamModels({ models: [{ name: "models/gemini-3-pro" }] })
    ).toEqual([{ id: "gemini-3-pro", type: "gemini", ownedBy: null }]);
    expect(() => parseUpstreamModels({ error: "nope" })).toThrow(
      "上游返回的不是模型列表"
    );
  });

  it("sends both auth headers to OpenAI-compatible upstreams", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ id: "gpt-6" }] }));
    await expect(
      fetchUpstreamModels("https://api.example.com", "sk-test", fetcher)
    ).resolves.toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("x-api-key")).toBe("sk-test");
  });

  it("passes the key as a query parameter to Google", async () => {
    const fetcher = vi.fn(async () => Response.json({ models: [] }));
    await fetchUpstreamModels(
      "https://generativelanguage.googleapis.com",
      "g-key",
      fetcher
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("key")).toBe("g-key");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("reports auth failures, HTTP errors and network errors in Chinese", async () => {
    await expect(
      fetchUpstreamModels("https://a.example.com", "k", async () =>
        new Response("no", { status: 401 })
      )
    ).rejects.toThrow("上游拒绝了 API Key（HTTP 401）");
    await expect(
      fetchUpstreamModels("https://a.example.com", "k", async () =>
        new Response("no", { status: 502 })
      )
    ).rejects.toThrow("上游返回 HTTP 502");
    await expect(
      fetchUpstreamModels("https://a.example.com", "k", async () => {
        throw new TypeError("fetch failed");
      })
    ).rejects.toThrow("无法连接上游：fetch failed");
  });
});
