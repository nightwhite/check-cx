import { parseModelId } from "../../../lib/utils/endpoint-builder";
import {
  generateChallenge,
  validateResponse,
  type Challenge,
} from "./challenge";
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

export interface DirectTcpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
}

export interface CheckProviderOptions {
  challenge?: Challenge;
  fetcher?: WorkerFetch;
  measurePing?: (endpoint: string) => Promise<number | null>;
  now?: () => number;
  timeoutMs?: number;
  openSocket?: (url: URL) => Promise<DirectTcpSocket> | DirectTcpSocket;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "unknown error";
}

async function openCloudflareSocket(url: URL): Promise<DirectTcpSocket> {
  const { connect } = await import("cloudflare:sockets");
  return connect({
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 80,
  });
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

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** chunked 的块大小按字节计数，必须基于字节解码，字符串切片会因多字节字符错位。 */
function decodeChunkedBodyBytes(input: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let index = 0;
  const sizeDecoder = new TextDecoder();
  while (index < input.length) {
    let lineEnd = index;
    while (
      lineEnd + 1 < input.length &&
      !(input[lineEnd] === 13 && input[lineEnd + 1] === 10)
    ) {
      lineEnd++;
    }
    if (lineEnd + 1 >= input.length) {
      break;
    }
    const sizeToken = sizeDecoder
      .decode(input.subarray(index, lineEnd))
      .split(";")[0]
      .trim();
    const size = Number.parseInt(sizeToken, 16);
    if (!Number.isFinite(size) || size <= 0) {
      break;
    }
    parts.push(input.subarray(lineEnd + 2, lineEnd + 2 + size));
    index = lineEnd + 2 + size + 2;
  }
  return concatBytes(parts);
}

async function performDirectTcpRequest(
  config: WorkerProviderConfig,
  challenge: Challenge,
  options: CheckProviderOptions,
  startedAt: number,
  now: () => number
): Promise<{ status: number; text: string; bodyHead: string; latencyMs: number }> {
  const url = new URL(config.endpoint);
  if (url.protocol !== "http:") {
    throw new Error("直连模式仅支持 http:// 端点（自定义 Host 无法通过 TLS 证书校验）");
  }

  const openSocket = options.openSocket ?? openCloudflareSocket;
  const socket = await openSocket(url);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    try {
      socket.close();
    } catch {
      // 关闭已断开的套接字无需处理。
    }
  }, timeoutMs);

  try {
    const writer = socket.writable.getWriter();
    const body = JSON.stringify(buildRequestBody(config, challenge));
    const bodyBytes = new TextEncoder().encode(body);
    const headerLines: string[] = [`Host: ${config.hostHeader}`];
    buildHeaders(config).forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "content-length" || lower === "connection") {
        return;
      }
      headerLines.push(`${key}: ${value}`);
    });
    headerLines.push(`Content-Length: ${bodyBytes.length}`, "Connection: close");
    const request = `${[
      `POST ${url.pathname}${url.search} HTTP/1.1`,
      ...headerLines,
    ].join("\r\n")}\r\n\r\n`;
    await writer.write(new TextEncoder().encode(request));
    await writer.write(bodyBytes);

    const reader = socket.readable.getReader();
    let firstChunkLatencyMs: number | null = null;
    const byteChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      firstChunkLatencyMs ??= Math.max(0, now() - startedAt);
      byteChunks.push(value);
    }
    const rawBytes = concatBytes(byteChunks);
    const raw = new TextDecoder().decode(rawBytes);

    const headerEndIndex = raw.indexOf("\r\n\r\n");
    const head = headerEndIndex === -1 ? raw : raw.slice(0, headerEndIndex);
    const statusMatch = head.match(/^HTTP\/\d(?:\.\d)? (\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : 0;

    // 头部为 ASCII，字符串索引与字节偏移一致，可安全用于切分字节流。
    const bodyStartByte = headerEndIndex === -1 ? rawBytes.length : headerEndIndex + 4;
    let responseBodyBytes = rawBytes.subarray(bodyStartByte);
    if (/transfer-encoding:\s*chunked/i.test(head)) {
      responseBodyBytes = decodeChunkedBodyBytes(responseBodyBytes);
    }
    const bodyText = new TextDecoder().decode(responseBodyBytes);

    let text = "";
    if (status >= 200 && status < 300) {
      const contentType = (
        head.match(/content-type:\s*([^\r\n]+)/i)?.[1] ?? ""
      ).toLowerCase();
      if (contentType.includes("text/event-stream")) {
        text = extractTextFromSseBody(bodyText);
      } else {
        try {
          text = extractResponseText(JSON.parse(bodyText));
        } catch {
          text = "";
        }
      }
    }

    return {
      status,
      text,
      bodyHead: bodyText.slice(0, 800),
      latencyMs: firstChunkLatencyMs ?? Math.max(0, now() - startedAt),
    };
  } finally {
    clearTimeout(timer);
    try {
      socket.close();
    } catch {
      // 关闭已断开的套接字无需处理。
    }
  }
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
            `Provider returned HTTP ${direct.status}`
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
    const response = await fetcher(buildRequestUrl(config), {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(buildRequestBody(config, challenge)),
      signal: controller.signal,
    });
    let latencyMs = Math.max(0, now() - startedAt);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const logMessage = errorBody.trim().slice(0, 800);
      return {
        ...buildBaseResult(
          config,
          "failed",
          checkedAtMs,
          `Provider returned HTTP ${response.status}`
        ),
        latencyMs,
        pingLatencyMs,
        ...(logMessage ? { logMessage } : {}),
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
    };
  } finally {
    clearTimeout(timeout);
  }
}
