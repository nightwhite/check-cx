import { describe, expect, it } from "vitest";

import { resolveModelBrand } from "../../lib/utils/model-brand";

describe("resolveModelBrand", () => {
  it.each([
    ["deepseek-v4-flash", "deepseek"],
    ["deepseek-v4.1-flash", "deepseek"],
    ["deepseek-v4-1-flash-261017", "deepseek"],
    ["gpt-5.4-mini", "openai"],
    ["gpt-5.6-sol", "openai"],
    ["gpt-6.1-sol", "openai"],
    ["GPT-6.1 Sol", "openai"],
    ["gpt-4o", "openai"],
    ["o3-mini", "openai"],
    ["chatgpt-4o-latest", "openai"],
    ["openai/gpt-4o", "openai"],
    ["azure/gpt-4o", "openai"],
    ["claude-opus-5-5", "anthropic"],
    ["anthropic.claude-3-5-haiku", "anthropic"],
    ["gemini-3-pro", "google"],
    ["models/gemini-2.0-flash", "google"],
    ["google/palm-2", "google"],
    ["qwen3-max", "qwen"],
    ["qwq-32b", "qwen"],
    ["qwen/qwen3-235b", "qwen"],
    ["kimi-k3", "kimi"],
    ["moonshot-v1-8k", "kimi"],
    ["glm-4.6", "zhipu"],
    ["chatglm3-6b", "zhipu"],
    ["grok-4", "grok"],
    ["llama-4-scout", "meta"],
    ["mistral-large", "mistral"],
    ["mixtral-8x22b", "mistral"],
    ["doubao-seed", "doubao"],
    ["hunyuan-t1", "hunyuan"],
    ["ernie-4.5", "baidu"],
    ["minimax-m2", "minimax"],
    ["yi-lightning", "yi"],
    ["baichuan-4", "baichuan"],
    ["command-r-plus", "cohere"],
    ["phi-4", "microsoft"],
    ["nova-pro", "nova"],
    ["sonar-pro", "perplexity"],
    ["nous-hermes-3", "nous"],
    ["nemotron-4", "nvidia"],
    ["jamba-1.5", "ai21"],
    ["dbrx-instruct", "dbrx"],
    ["unknown-model", "generic"],
    ["", "generic"],
  ])("maps %s to %s", (model, expected) => {
    expect(resolveModelBrand(model)).toBe(expected);
  });

  it("strips reasoning directives before matching", () => {
    expect(resolveModelBrand("o1@high")).toBe("openai");
    expect(resolveModelBrand("deepseek-v4-flash#low")).toBe("deepseek");
  });
});
