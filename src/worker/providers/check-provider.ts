import { parseModelId } from "../../../lib/utils/endpoint-builder";
import {
  generateChallenge,
  validateResponse,
  type Challenge,
} from "./challenge";
import {
  performDirectHttpRequest,
  type OpenDirectSocket,
} from "./direct-http";
import { measureEndpointPing, type WorkerFetch } from "./endpoint-ping";
import type {
  WorkerCheckResult,
  WorkerHealthStatus,
  WorkerProviderConfig,
} from "./types";

/** Provider 请求默认超时时间：120 秒。 */
const DEFAULT_TIMEOUT_MS = 120_000;
/** 成功但超过此延迟的请求标记为 degraded。 */
const DEGRADED_THRESHOLD_MS = 30_000;
/** 探活请求的输出上限。部分上游（如 Azure）要求最小 16，32 为推理模型留出余量。 */
const PROBE_MAX_OUTPUT_TOKENS = 32;
const RESERVED_METADATA_KEYS = new Set([
  "contents",
  "generationConfig",
  "input",
  "max_output_tokens",
  "max_tokens",
  "messages",
  "model",
  "reasoning",
  "reasoning_effort",
]);
const GOOGLE_GENERATIVE_API_REGEX =
  /\/v\d+\w*\/models\/[^/:]+:(generateContent|streamGenerateContent)\/?$/;

export interface CheckProviderOptions {
  challenge?: Challenge;
  fetcher?: WorkerFetch;
  measurePing?: (endpoint: string) => Promise<number | null>;
  now?: () => number;
  timeoutMs?: number;
  openSocket?: OpenDirectSocket;
}

function buildBaseResult(
  config: WorkerProviderConfig,
  status: WorkerHealthStatus,
  checkedAtMs: number,
  message: string
): WorkerCheckResult {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    status,
    latencyMs: null,
    pingLatencyMs: null,
    checkedAt: new Date(checkedAtMs).toISOString(),
    message,
    groupName: config.groupName ?? null,
    channelId: config.channelId ?? null,
    channelName: config.channelName ?? null,
    channelLogoUrl: config.channelLogoUrl ?? null,
    region: config.region ?? null,
  };
}

function buildHeaders(config: WorkerProviderConfig): Headers {
  const headers = new Headers();
  headers.set("content-type", "application/json");

  if (config.type === "anthropic") {
    headers.set("x-api-key", config.apiKey);
    headers.set("anthropic-version", "2023-06-01");
  } else if (config.type === "openai" || isOpenAICompatibleGemini(config)) {
    headers.set("authorization", `Bearer ${config.apiKey}`);
  }

  for (const [key, value] of Object.entries(config.requestHeaders ?? {})) {
    headers.set(key, value);
  }

  return headers;
}

function filterMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !RESERVED_METADATA_KEYS.has(key))
  );
}

function isGoogleGenerativeEndpoint(endpoint: string): boolean {
  return GOOGLE_GENERATIVE_API_REGEX.test(endpoint.split("?")[0]);
}

function isOpenAICompatibleGemini(config: WorkerProviderConfig): boolean {
  return config.type === "gemini" && !isGoogleGenerativeEndpoint(config.endpoint);
}

function buildRequestBody(config: WorkerProviderConfig, challenge: Challenge) {
  const metadata = filterMetadata(config.metadata);
  const { modelId } = parseModelId(config.model);

  if (config.type === "anthropic") {
    return {
      ...metadata,
      model: modelId,
      max_tokens: PROBE_MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: challenge.prompt }],
    };
  }

  if (config.type === "gemini" && isGoogleGenerativeEndpoint(config.endpoint)) {
    return {
      ...metadata,
      contents: [{ role: "user", parts: [{ text: challenge.prompt }] }],
      generationConfig: { maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS },
    };
  }

  if (config.apiFormat === "responses") {
    return {
      ...metadata,
      model: modelId,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: challenge.prompt }],
        },
      ],
      max_output_tokens: PROBE_MAX_OUTPUT_TOKENS,
      reasoning: { effort: "low" },
      stream: true,
    };
  }

  return {
    ...metadata,
    model: modelId,
    messages: [{ role: "user", content: challenge.prompt }],
    max_tokens: PROBE_MAX_OUTPUT_TOKENS,
  };
}

function buildRequestUrl(config: WorkerProviderConfig): string {
  if (
    config.type !== "gemini" ||
    !isGoogleGenerativeEndpoint(config.endpoint) ||
    !config.apiKey
  ) {
    return config.endpoint;
  }

  const url = new URL(
    config.endpoint.replace(":streamGenerateContent", ":generateContent")
  );
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", config.apiKey);
  }
  return url.toString();
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractTextFromParts(parts: unknown): string | null {
  const texts = getArray(parts)
    .map((part) => getString(getObject(part)?.text))
    .filter((item): item is string => Boolean(item));
  return texts.length > 0 ? texts.join("\n") : null;
}

function extractResponseText(payload: unknown): string {
  const root = getObject(payload);
  if (!root) {
    return "";
  }

  const outputText = getString(root.output_text);
  if (outputText) {
    return outputText;
  }

  const choice = getObject(getArray(root.choices)[0]);
  const choiceMessage = getObject(choice?.message);
  const choiceContent = getString(choiceMessage?.content);
  if (choiceContent) {
    return choiceContent;
  }

  // 推理模型可能把内容放在 reasoning_content 里，content 为空；探活非空即视为可用。
  const reasoningContent =
    getString(choiceMessage?.reasoning_content) ??
    getString(choiceMessage?.reasoning);
  if (reasoningContent) {
    return reasoningContent;
  }

  const anthropicContent = getObject(getArray(root.content)[0]);
  const anthropicText = getString(anthropicContent?.text);
  if (anthropicText) {
    return anthropicText;
  }

  const candidate = getObject(getArray(root.candidates)[0]);
  const candidateContent = getObject(candidate?.content);
  const geminiText = extractTextFromParts(candidateContent?.parts);
  if (geminiText) {
    return geminiText;
  }

  for (const outputValue of getArray(root.output)) {
    const outputItem = getObject(outputValue);
    for (const contentValue of getArray(outputItem?.content)) {
      const outputContent = getObject(contentValue);
      const responseText = getString(outputContent?.text);
      if (responseText) {
        return responseText;
      }
    }
  }

  return "";
}

function extractTextFromResponseStreamEvent(payload: unknown): string {
  const root = getObject(payload);
  if (!root) {
    return "";
  }

  if (root.type === "response.output_text.delta") {
    return getString(root.delta) ?? "";
  }

  const delta = getString(root.delta);
  if (delta) {
    return delta;
  }

  return extractResponseText(root);
}

function parseResponseStreamEvent(rawEvent: string): string {
  const dataLines: string[] = [];
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    dataLines.push(data);
  }

  if (dataLines.length === 0) {
    return "";
  }

  // 上游代理注入 ping 心跳时会吞掉事件分隔符，同一块内可能挤进多条完整事件，
  // 因此逐行解析：单行不完整才与下一行拼接（SSE 规范的多行 data 行为）。
  let text = "";
  let buffer: string[] = [];
  for (const data of dataLines) {
    buffer.push(data);
    try {
      text += extractTextFromResponseStreamEvent(JSON.parse(buffer.join("\n")));
      buffer = [];
    } catch {
      // 单行不完整：与下一行拼接后重试。
    }
  }
  if (buffer.length > 0) {
    throw new Error("Malformed Responses stream event");
  }

  return text;
}

async function readTextFromResponseStream(
  response: Response,
  startedAt: number,
  now: () => number
) {
  if (!response.body) {
    return {
      text: "",
      firstChunkLatencyMs: Math.max(0, now() - startedAt),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let firstChunkLatencyMs: number | null = null;
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    firstChunkLatencyMs ??= Math.max(0, now() - startedAt);
    buffer += decoder.decode(value, { stream: true });

    let eventEndIndex = buffer.indexOf("\n\n");
    while (eventEndIndex !== -1) {
      const rawEvent = buffer.slice(0, eventEndIndex);
      buffer = buffer.slice(eventEndIndex + 2);
      text += parseResponseStreamEvent(rawEvent);
      eventEndIndex = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    text += parseResponseStreamEvent(buffer);
  }

  return {
    text,
    firstChunkLatencyMs: firstChunkLatencyMs ?? Math.max(0, now() - startedAt),
  };
}

const SENSITIVE_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "cookie",
  "authorization",
  "proxy-authorization",
  "x-api-key",
]);

function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of url.searchParams.keys()) {
      if (/(key|token|secret|password)/i.test(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function formatResponseHeaders(headers: Headers): string {
  const lines: string[] = [];
  headers.forEach((value, key) => {
    if (!SENSITIVE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      lines.push(`${key}: ${value}`);
    }
  });
  return lines.join("\n");
}

function describeHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return "Provider returned HTTP 400（请求参数被上游拒绝）";
    case 401:
    case 403:
      return `Provider returned HTTP ${status}（上游认证失败）`;
    case 404:
      return "Provider returned HTTP 404（端点或模型不存在）";
    case 408:
    case 524:
      return `Provider returned HTTP ${status}（上游响应超时）`;
    case 429:
      return "Provider returned HTTP 429（上游限流）";
    case 500:
      return "Provider returned HTTP 500（上游内部错误）";
    case 502:
      return "Provider returned HTTP 502（上游网关错误）";
    case 503:
      return "Provider returned HTTP 503（上游暂不可用）";
    case 521:
      return "Provider returned HTTP 521（上游源站不可达）";
    default:
      return `Provider returned HTTP ${status}`;
  }
}

function describeHttpStatusDetail(status: number): string {
  switch (status) {
    case 400:
      return "上游拒绝了请求参数，请检查模型名、API 格式和 max_tokens 等配置。";
    case 401:
    case 403:
      return "上游认证失败，请检查 API Key、权限或渠道配置。";
    case 404:
      return "上游找不到端点或模型，请检查 Base URL、API 格式和模型名。";
    case 408:
    case 524:
      return "上游响应超时，可能是上游拥塞或网络链路问题。";
    case 429:
      return "上游限流，请降低检查频率或提升配额。";
    case 500:
      return "上游内部错误。";
    case 502:
      return "上游网关错误，通常是网关无法连接后端或后端提前断开连接。";
    case 503:
      return "上游暂不可用，常见于上游维护、限流或后端全部不可用。";
    case 521:
      return "Cloudflare 无法连接到上游源站（Web server is down），常见原因是上游服务宕机、端口未监听或防火墙拒绝连接。";
    default:
      return "";
  }
}

function buildHttpErrorLog(
  requestUrl: string,
  response: Response,
  body: string
): string {
  const parts = [
    `POST ${redactUrl(requestUrl)}`,
    `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
  ];
  const detail = describeHttpStatusDetail(response.status);
  if (detail) {
    parts.push(`说明: ${detail}`);
  }
  const headers = formatResponseHeaders(response.headers);
  if (headers) {
    parts.push(headers);
  }
  const trimmedBody = body.trim().slice(0, 1200);
  if (trimmedBody) {
    parts.push("", trimmedBody);
  }
  return parts.join("\n").slice(0, 2400);
}

function getErrorCause(error: Error): string | null {
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return cause.message;
  }
  return typeof cause === "string" ? cause : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = getErrorCause(error);
    return cause && cause !== error.message
      ? `${error.message}: ${cause}`
      : error.message;
  }
  return typeof error === "string" ? error : "unknown error";
}

function getErrorLog(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, getErrorCause(error)]
      .filter((item): item is string => Boolean(item))
      .join("\n")
      .slice(0, 2400);
  }
  return typeof error === "string" ? error.slice(0, 2400) : "unknown error";
}

function extractTextFromSseBody(bodyText: string): string {
  let text = "";
  for (const rawEvent of bodyText.split(/\r?\n\r?\n/)) {
    if (rawEvent.trim()) {
      text += parseResponseStreamEvent(rawEvent);
    }
  }
  return text;
}

async function performDirectTcpRequest(
  config: WorkerProviderConfig,
  challenge: Challenge,
  options: CheckProviderOptions,
  startedAt: number,
  now: () => number
): Promise<{ status: number; text: string; bodyHead: string; latencyMs: number }> {
  let firstChunkLatencyMs: number | null = null;
  const response = await performDirectHttpRequest({
    method: "POST",
    url: config.endpoint,
    hostHeader: config.hostHeader ?? "",
    headers: buildHeaders(config),
    body: JSON.stringify(buildRequestBody(config, challenge)),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    openSocket: options.openSocket,
    onFirstChunk: () => {
      firstChunkLatencyMs = Math.max(0, now() - startedAt);
    },
  });
  const { status, head, bodyText } = response;

  let text = "";
  if (status >= 200 && status < 300) {
    if (response.contentType.includes("text/event-stream")) {
      text = extractTextFromSseBody(bodyText);
    } else {
      try {
        text = extractResponseText(JSON.parse(bodyText));
      } catch {
        text = "";
      }
    }
  }

  const logParts = [
    `POST ${redactUrl(config.endpoint)} HTTP/1.1`,
    `Host: ${config.hostHeader ?? ""}`,
  ];
  if (head) {
    logParts.push(
      "",
      head
        .split(/\r?\n/)
        .filter((line) => !/^set-cookie:/i.test(line))
        .join("\n")
    );
  }
  const bodyForLog = bodyText.trim().slice(0, 1200);
  if (bodyForLog) {
    logParts.push("", bodyForLog);
  }

  return {
    status,
    text,
    bodyHead: logParts.join("\n").slice(0, 2400),
    latencyMs: firstChunkLatencyMs ?? Math.max(0, now() - startedAt),
  };
}

function buildTextCheckResult(
  config: WorkerProviderConfig,
  text: string,
  latencyMs: number,
  checkedAtMs: number,
  pingLatencyMs: number | null
): WorkerCheckResult {
  const validation = validateResponse(text);
  const status: WorkerHealthStatus = validation.valid
    ? latencyMs > DEGRADED_THRESHOLD_MS
      ? "degraded"
      : "operational"
    : "validation_failed";

  return {
    ...buildBaseResult(
      config,
      status,
      checkedAtMs,
      validation.valid ? "OK" : "响应为空"
    ),
    latencyMs,
    pingLatencyMs,
    logMessage: text,
  };
}

export async function checkProvider(
  config: WorkerProviderConfig,
  options: CheckProviderOptions = {}
): Promise<WorkerCheckResult> {
  const now = options.now ?? Date.now;
  const checkedAtMs = now();

  if (config.isMaintenance) {
    return buildBaseResult(config, "maintenance", checkedAtMs, "维护模式");
  }

  if (config.configError) {
    return buildBaseResult(config, "error", checkedAtMs, config.configError);
  }

  const fetcher = options.fetcher ?? fetch;
  const challenge = options.challenge ?? generateChallenge();
  const pingLatencyMs = await (options.measurePing ?? measureEndpointPing)(
    config.endpoint
  );
  const startedAt = now();

  if (config.hostHeader) {
    try {
      const direct = await performDirectTcpRequest(
        config,
        challenge,
        options,
        startedAt,
        now
      );
      if (direct.status < 200 || direct.status >= 300) {
        return {
          ...buildBaseResult(
            config,
            "failed",
            checkedAtMs,
            describeHttpStatus(direct.status)
          ),
          latencyMs: direct.latencyMs,
          pingLatencyMs,
          logMessage: direct.bodyHead,
        };
      }
      return buildTextCheckResult(
        config,
        direct.text,
        direct.latencyMs,
        checkedAtMs,
        pingLatencyMs
      );
    } catch (error) {
      return {
        ...buildBaseResult(config, "failed", checkedAtMs, getErrorMessage(error)),
        pingLatencyMs,
        logMessage: getErrorLog(error),
      };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const isResponsesRequest = config.apiFormat === "responses";

  try {
    const requestUrl = buildRequestUrl(config);
    const response = await fetcher(requestUrl, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(buildRequestBody(config, challenge)),
      signal: controller.signal,
    });
    let latencyMs = Math.max(0, now() - startedAt);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        ...buildBaseResult(
          config,
          "failed",
          checkedAtMs,
          describeHttpStatus(response.status)
        ),
        latencyMs,
        pingLatencyMs,
        logMessage: buildHttpErrorLog(requestUrl, response, errorBody),
      };
    }

    let text: string;
    if (isResponsesRequest) {
      const streamResult = await readTextFromResponseStream(
        response,
        startedAt,
        now
      );
      text = streamResult.text;
      latencyMs = streamResult.firstChunkLatencyMs;
    } else {
      const payload = await response.json();
      text = extractResponseText(payload);
    }

    return buildTextCheckResult(
      config,
      text,
      latencyMs,
      checkedAtMs,
      pingLatencyMs
    );
  } catch (error) {
    return {
      ...buildBaseResult(
        config,
        "failed",
        checkedAtMs,
        getErrorMessage(error)
      ),
      pingLatencyMs,
      logMessage: getErrorLog(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
