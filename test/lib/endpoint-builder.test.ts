import { describe, expect, it } from "vitest";

import {
  buildEndpointFromBaseUrl,
  parseModelId,
} from "../../lib/utils/endpoint-builder";

describe("buildEndpointFromBaseUrl", () => {
  it("builds OpenAI chat completions and responses endpoints", () => {
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://api.example.com/",
        type: "openai",
        apiFormat: "chat_completions",
        model: "gpt-4o-mini",
      })
    ).toBe("https://api.example.com/v1/chat/completions");
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://api.example.com",
        type: "openai",
        apiFormat: "responses",
        model: "gpt-5",
      })
    ).toBe("https://api.example.com/v1/responses");
  });

  it("does not duplicate an existing /v1 segment", () => {
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://api.example.com/v1//",
        type: "openai",
        apiFormat: "responses",
        model: "gpt-5",
      })
    ).toBe("https://api.example.com/v1/responses");
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://relay.example.com/proxy/v1",
        type: "anthropic",
        model: "claude-sonnet",
      })
    ).toBe("https://relay.example.com/proxy/v1/messages");
  });

  it("builds Anthropic messages endpoint", () => {
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://api.anthropic.com",
        type: "anthropic",
        model: "claude-sonnet",
      })
    ).toBe("https://api.anthropic.com/v1/messages");
  });

  it("builds native Gemini endpoints without model directives", () => {
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://generativelanguage.googleapis.com",
        type: "gemini",
        model: "gemini-2.5-flash@low",
      })
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/",
        type: "gemini",
        model: "gemini-2.5-pro",
      })
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
    );
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "https://gemini.example.com/v1",
        type: "gemini",
        model: "gemini-2.5-pro",
      })
    ).toBe("https://gemini.example.com/v1/models/gemini-2.5-pro:generateContent");
  });

  it("returns null for an empty base URL", () => {
    expect(
      buildEndpointFromBaseUrl({
        baseUrl: "  ",
        type: "openai",
        model: "gpt-5",
      })
    ).toBeNull();
  });
});

describe("parseModelId", () => {
  it("strips reasoning directives", () => {
    expect(parseModelId(" gpt-5#HIGH ")).toEqual({ modelId: "gpt-5" });
    expect(parseModelId("gpt-5")).toEqual({ modelId: "gpt-5" });
  });
});
