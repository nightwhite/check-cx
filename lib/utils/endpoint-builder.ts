/**
 * 渠道 Base URL → 完整请求端点的拼接逻辑。
 * 纯函数，不依赖任何运行时，Worker 与后台前端共用。
 */

export type EndpointProviderType = "openai" | "gemini" | "anthropic";
export type EndpointApiFormat = "chat_completions" | "responses";

/** 去掉模型名尾部的 `@low` / `#high` 等推理档位指令。 */
export function parseModelId(model: string): { modelId: string } {
  const trimmed = model.trim();
  const directiveMatch = trimmed.match(
    /^(.*?)[@#](mini|minimal|low|medium|high)$/i
  );
  if (directiveMatch) {
    const [, modelId] = directiveMatch;
    return {
      modelId: modelId.trim() || trimmed,
    };
  }

  return {
    modelId: trimmed,
  };
}

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}

function withVersion(base: string, versions: string[], fallback: string) {
  const lower = base.toLowerCase();
  if (versions.some((version) => lower.endsWith(`/${version}`))) {
    return base;
  }
  return `${base}/${fallback}`;
}

export interface BuildEndpointInput {
  baseUrl: string;
  type: EndpointProviderType;
  apiFormat?: EndpointApiFormat | null;
  model: string;
}

/**
 * 按 Provider 类型与 API 格式拼接完整端点：
 * - openai chat_completions → `/v1/chat/completions`
 * - openai responses → `/v1/responses`
 * - anthropic → `/v1/messages`
 * - gemini → `/v1beta/models/{model}:generateContent`
 * Base URL 已带版本段（`/v1`、gemini 的 `/v1beta`）时不重复拼接。
 */
export function buildEndpointFromBaseUrl({
  baseUrl,
  type,
  apiFormat,
  model,
}: BuildEndpointInput): string | null {
  const base = trimTrailingSlashes(baseUrl);
  if (!base) {
    return null;
  }

  if (type === "anthropic") {
    return `${withVersion(base, ["v1"], "v1")}/messages`;
  }

  if (type === "gemini") {
    const { modelId } = parseModelId(model);
    if (!modelId) {
      return null;
    }
    return `${withVersion(base, ["v1beta", "v1"], "v1beta")}/models/${encodeURIComponent(
      modelId
    )}:generateContent`;
  }

  const path = apiFormat === "responses" ? "responses" : "chat/completions";
  return `${withVersion(base, ["v1"], "v1")}/${path}`;
}
