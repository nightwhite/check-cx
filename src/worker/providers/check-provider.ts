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

const DEFAULT_TIMEOUT_MS = 45_000;
const DEGRADED_THRESHOLD_MS = 6_000;

export interface CheckProviderOptions {
  challenge?: Challenge;
  fetcher?: WorkerFetch;
  measurePing?: (endpoint: string) => Promise<number | null>;
  now?: () => number;
  timeoutMs?: number;
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
  };
}

function buildHeaders(config: WorkerProviderConfig): Headers {
  const headers = new Headers(config.requestHeaders ?? undefined);
  headers.set("content-type", "application/json");

  if (config.type === "anthropic") {
    headers.set("x-api-key", config.apiKey);
    if (!headers.has("anthropic-version")) {
      headers.set("anthropic-version", "2023-06-01");
    }
    return headers;
  }

  if (config.type === "openai") {
    headers.set("authorization", `Bearer ${config.apiKey}`);
  }

  return headers;
}

function buildRequestBody(config: WorkerProviderConfig, challenge: Challenge) {
  if (config.type === "anthropic") {
    return {
      model: config.model,
      max_tokens: 1,
      messages: [{ role: "user", content: challenge.prompt }],
      ...(config.metadata ?? {}),
    };
  }

  if (config.type === "gemini") {
    return {
      contents: [{ role: "user", parts: [{ text: challenge.prompt }] }],
      generationConfig: { maxOutputTokens: 1 },
      ...(config.metadata ?? {}),
    };
  }

  if (/\/responses\/?$/.test(config.endpoint.split("?")[0])) {
    return {
      model: config.model,
      input: challenge.prompt,
      max_output_tokens: 1,
      ...(config.metadata ?? {}),
    };
  }

  return {
    model: config.model,
    messages: [{ role: "user", content: challenge.prompt }],
    max_tokens: 1,
    ...(config.metadata ?? {}),
  };
}

function buildRequestUrl(config: WorkerProviderConfig): string {
  if (config.type !== "gemini" || !config.apiKey) {
    return config.endpoint;
  }

  const url = new URL(config.endpoint);
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

  const outputItem = getObject(getArray(root.output)[0]);
  const outputContent = getObject(getArray(outputItem?.content)[0]);
  const responseText = getString(outputContent?.text);
  return responseText ?? "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "unknown error";
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

  const fetcher = options.fetcher ?? fetch;
  const challenge = options.challenge ?? generateChallenge();
  const pingLatencyMs = await (options.measurePing ?? measureEndpointPing)(
    config.endpoint
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const startedAt = now();

  try {
    const response = await fetcher(buildRequestUrl(config), {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(buildRequestBody(config, challenge)),
      signal: controller.signal,
    });
    const latencyMs = Math.max(0, now() - startedAt);

    if (!response.ok) {
      return {
        ...buildBaseResult(
          config,
          "failed",
          checkedAtMs,
          `Provider returned HTTP ${response.status}`
        ),
        latencyMs,
        pingLatencyMs,
      };
    }

    const payload = await response.json();
    const text = extractResponseText(payload);
    const validation = validateResponse(text, challenge.expectedAnswer);
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
        validation.valid ? "OK" : "响应校验失败"
      ),
      latencyMs,
      pingLatencyMs,
      logMessage: text,
    };
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
