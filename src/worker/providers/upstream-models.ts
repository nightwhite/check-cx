import {
  performDirectHttpRequest,
  type OpenDirectSocket,
} from "./direct-http";
import type { WorkerProviderType } from "./types";

export type UpstreamFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface UpstreamModel {
  id: string;
  type: WorkerProviderType;
  ownedBy: string | null;
}

export class UpstreamModelsError extends Error {}

const DEFAULT_TIMEOUT_MS = 15_000;
const GOOGLE_API_HOST = "generativelanguage.googleapis.com";

function trimTrailingSlashes(value: string) {
  return value.trim().replace(/\/+$/g, "");
}

function isGoogleNative(baseUrl: string) {
  try {
    return new URL(baseUrl).host === GOOGLE_API_HOST;
  } catch {
    return false;
  }
}

/** 模型列表地址：Base URL 已带版本段时不重复拼接。 */
export function buildModelsUrl(baseUrl: string): string {
  const base = trimTrailingSlashes(baseUrl);
  if (isGoogleNative(base)) {
    return /\/v1(beta)?$/i.test(base) ? `${base}/models` : `${base}/v1beta/models`;
  }
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
}

/** 按模型名推断 Provider 类型，导入时可在界面上再修改。 */
export function inferProviderType(modelId: string): WorkerProviderType {
  const id = modelId.toLowerCase();
  if (id.includes("claude")) {
    return "anthropic";
  }
  if (id.includes("gemini")) {
    return "gemini";
  }
  return "openai";
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// OpenAI / Anthropic / one-api 等返回 { data: [{ id }] }；Gemini 原生返回 { models: [{ name }] }
export function parseUpstreamModels(payload: unknown): UpstreamModel[] {
  const body = getObject(payload);
  const entries = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : Array.isArray(payload)
        ? payload
        : null;
  if (!entries) {
    throw new UpstreamModelsError("上游返回的不是模型列表");
  }

  const seen = new Set<string>();
  const models: UpstreamModel[] = [];
  for (const entry of entries) {
    const item = getObject(entry);
    const rawId =
      typeof item?.id === "string"
        ? item.id
        : typeof item?.name === "string"
          ? item.name
          : null;
    const id = rawId?.replace(/^models\//, "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({
      id,
      type: inferProviderType(id),
      ownedBy: typeof item?.owned_by === "string" ? item.owned_by : null,
    });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export interface FetchUpstreamModelsOptions {
  fetcher?: UpstreamFetch;
  /** 直连 Host：填写后经 TCP 直连并改写 Host 头，Base URL 须为 http://。 */
  hostHeader?: string | null;
  openSocket?: OpenDirectSocket;
  timeoutMs?: number;
}

/** 直连请求的结果包装成 Response，复用后续统一的状态码与 JSON 处理。 */
async function fetchDirect(
  url: string,
  hostHeader: string,
  headers: Headers,
  timeoutMs: number,
  openSocket?: OpenDirectSocket
): Promise<Response> {
  const direct = await performDirectHttpRequest({
    method: "GET",
    url,
    hostHeader,
    headers,
    timeoutMs,
    openSocket,
  });
  if (direct.status === 0) {
    throw new Error("上游未返回有效的 HTTP 响应");
  }
  return new Response(direct.bodyText, {
    status: direct.status,
    headers: { "content-type": direct.contentType },
  });
}

export async function fetchUpstreamModels(
  baseUrl: string,
  apiKey: string,
  {
    fetcher = fetch,
    hostHeader,
    openSocket,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: FetchUpstreamModelsOptions = {}
): Promise<UpstreamModel[]> {
  const google = isGoogleNative(baseUrl);
  const url = new URL(buildModelsUrl(baseUrl));
  const headers = new Headers({ accept: "application/json" });
  if (google) {
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
  } else {
    // 同时带上两种鉴权头，兼容 OpenAI 兼容中转与 Anthropic 官方接口
    headers.set("authorization", `Bearer ${apiKey}`);
    headers.set("x-api-key", apiKey);
    headers.set("anthropic-version", "2023-06-01");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = hostHeader
      ? await fetchDirect(url.toString(), hostHeader, headers, timeoutMs, openSocket)
      : await fetcher(url.toString(), {
          headers,
          signal: controller.signal,
        });
  } catch (error) {
    throw new UpstreamModelsError(
      controller.signal.aborted
        ? "请求上游模型列表超时"
        : `无法连接上游：${error instanceof Error ? error.message : "未知错误"}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UpstreamModelsError(`上游拒绝了 API Key（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    throw new UpstreamModelsError(`上游返回 HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => {
    throw new UpstreamModelsError("上游返回的不是 JSON");
  });
  return parseUpstreamModels(payload);
}
