/**
 * 模型 ID → 品牌匹配。
 *
 * 这里只根据模型 ID/模型名判断品牌，不依赖 Provider 类型：
 * 很多 OpenAI 兼容渠道会同时提供 DeepSeek、Qwen 等模型，用 type 会把它们
 * 全部显示成 OpenAI 图标。无法识别的模型回退到通用图标。
 */

export type ModelBrand =
  | "openai"
  | "deepseek"
  | "anthropic"
  | "google"
  | "qwen"
  | "kimi"
  | "zhipu"
  | "grok"
  | "meta"
  | "mistral"
  | "doubao"
  | "hunyuan"
  | "baidu"
  | "minimax"
  | "yi"
  | "baichuan"
  | "cohere"
  | "microsoft"
  | "nova"
  | "perplexity"
  | "nous"
  | "nvidia"
  | "ai21"
  | "dbrx"
  | "generic";

const BRAND_RULES: Array<{ brand: ModelBrand; patterns: RegExp[] }> = [
  { brand: "deepseek", patterns: [/deepseek/] },
  {
    brand: "openai",
    patterns: [
      /(?:^|[/_.-])gpt(?:[-_. ]|\d|$)/,
      /(?:^|[/_.-])chatgpt(?:[-_. ]|$)/,
      /(?:^|[/_.-])openai(?:[-_. ]|$)/,
      /(?:^|[/_.-])codex(?:[-_. ]|$)/,
      /(?:^|[/_.-])o[1-9](?:[-_. ]|$)/,
    ],
  },
  {
    brand: "anthropic",
    patterns: [
      /(?:^|[/_.-])claude(?:[-_. ]|$)/,
      /(?:^|[/_.-])anthropic(?:[-_. ]|$)/,
    ],
  },
  {
    brand: "google",
    patterns: [
      /(?:^|[/_.-])gemini(?:[-_. ]|$)/,
      /(?:^|[/_.-])google(?:[-_. ]|$)/,
      /(?:^|[/_.-])palm(?:[-_. ]|$)/,
    ],
  },
  {
    brand: "qwen",
    patterns: [
      /(?:^|[/_.-])qwen/,
      /(?:^|[/_.-])qwq(?:[-_. ]|$)/,
      /tongyi/,
      /通义/,
    ],
  },
  {
    brand: "kimi",
    patterns: [/(?:^|[/_.-])kimi(?:[-_. ]|$)/, /moonshot/],
  },
  {
    brand: "zhipu",
    patterns: [
      /(?:^|[/_.-])glm(?:[-_. ]|$)/,
      /chatglm/,
      /zhipu/,
      /智谱/,
    ],
  },
  { brand: "grok", patterns: [/(?:^|[/_.-])grok(?:[-_. ]|$)/] },
  {
    brand: "meta",
    patterns: [
      /(?:^|[/_.-])llama(?:[-_. ]|$)/,
      /(?:^|[/_.-])meta(?:[-_. ]|$)/,
    ],
  },
  { brand: "mistral", patterns: [/mistral/, /mixtral/, /codestral/, /devstral/] },
  { brand: "doubao", patterns: [/doubao/, /豆包/] },
  { brand: "hunyuan", patterns: [/hunyuan/, /混元/] },
  {
    brand: "baidu",
    patterns: [
      /(?:^|[/_.-])ernie(?:[-_. ]|$)/,
      /wenxin/,
      /文心/,
    ],
  },
  {
    brand: "minimax",
    patterns: [/minimax/, /(?:^|[/_.-])abab(?:[-_. ]|$)/],
  },
  {
    brand: "yi",
    patterns: [/(?:^|[/_.-])yi(?:[-_. ]|$)/, /01[-_.]?ai/],
  },
  { brand: "baichuan", patterns: [/baichuan/, /百川/] },
  {
    brand: "cohere",
    patterns: [
      /(?:^|[/_.-])command(?:[-_. ]|$)/,
      /cohere/,
    ],
  },
  {
    brand: "microsoft",
    patterns: [
      /(?:^|[/_.-])phi(?:[-_. ]|$)/,
      /microsoft/,
    ],
  },
  {
    brand: "nova",
    patterns: [
      /(?:^|[/_.-])nova(?:[-_. ]|$)/,
      /amazon[-_. ]?nova/,
    ],
  },
  {
    brand: "perplexity",
    patterns: [
      /perplexity/,
      /(?:^|[/_.-])sonar(?:[-_. ]|$)/,
    ],
  },
  {
    brand: "nous",
    patterns: [
      /(?:^|[/_.-])nous(?:[-_. ]|$)/,
      /hermes/,
    ],
  },
  { brand: "nvidia", patterns: [/nvidia/, /nemotron/] },
  { brand: "ai21", patterns: [/ai21/, /jamba/] },
  { brand: "dbrx", patterns: [/dbrx/, /databricks/] },
];

/** 去掉 `o1@high` / `deepseek-v4#low` 这类推理档位后缀。 */
function normalizeModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/[@#](?:mini|minimal|low|medium|high)$/, "");
}

export function resolveModelBrand(
  model: string | null | undefined
): ModelBrand {
  const normalized = normalizeModelId(model ?? "");
  if (!normalized) {
    return "generic";
  }

  for (const rule of BRAND_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.brand;
    }
  }

  return "generic";
}
