import type {
  AdminApiFormat,
  AdminNotificationLevel,
  AdminProviderType,
} from "../../db/repositories/admin";

export class AdminValidationError extends Error {
  readonly status = 400;
}

export class AdminConflictError extends Error {
  readonly status = 409;
}

export class AdminNotFoundError extends Error {
  readonly status = 404;
}

export class AdminUnavailableError extends Error {
  readonly status = 503;
}

export function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminValidationError("请求体必须是 JSON object");
  }

  return value as Record<string, unknown>;
}

export async function readJsonObject(request: Request) {
  return assertObject(await request.json().catch(() => null));
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminValidationError(`${label} 不能为空`);
  }
  return value.trim();
}

export function optionalString(
  body: Record<string, unknown>,
  key: string
): string | null {
  const value = body[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AdminValidationError(`${key} 必须是字符串`);
  }
  return value.trim() || null;
}

export function optionalBoolean(
  body: Record<string, unknown>,
  key: string,
  defaultValue: boolean
): boolean {
  const value = body[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    throw new AdminValidationError(`${key} 必须是 boolean`);
  }
  return value;
}

export function optionalInteger(
  body: Record<string, unknown>,
  key: string,
  label: string
): number | null {
  const value = body[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AdminValidationError(`${label} 必须是整数`);
  }
  return value;
}

export function requiredInteger(
  body: Record<string, unknown>,
  key: string,
  label: string
): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AdminValidationError(`${label} 必须是整数`);
  }
  return value;
}

export function optionalHttpUrl(
  body: Record<string, unknown>,
  key: string,
  label: string
): string | null {
  const value = optionalString(body, key);
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    throw new AdminValidationError(`${label} 必须是 http/https URL`);
  }

  throw new AdminValidationError(`${label} 必须是 http/https URL`);
}

export function optionalHttpOrigin(
  body: Record<string, unknown>,
  key: string,
  label: string
): string | null {
  const value = optionalString(body, key);
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === value.replace(/\/$/, "") &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    ) {
      return url.origin;
    }
  } catch {
    throw new AdminValidationError(`${label} 必须是 http/https origin`);
  }

  throw new AdminValidationError(`${label} 必须是 http/https origin`);
}

export function providerType(value: string): AdminProviderType {
  if (value === "openai" || value === "gemini" || value === "anthropic") {
    return value;
  }
  throw new AdminValidationError("Provider 类型非法");
}

export function apiFormat(value: string): AdminApiFormat {
  if (value === "chat_completions" || value === "responses") {
    return value;
  }
  throw new AdminValidationError("API 格式非法");
}

export function notificationLevel(value: string): AdminNotificationLevel {
  if (value === "info" || value === "warning" || value === "error") {
    return value;
  }
  throw new AdminValidationError("通知级别非法");
}

export function optionalJsonRecord(
  body: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = body[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminValidationError(`${key} 必须是 JSON object`);
  }
  return value as Record<string, unknown>;
}

export function isAdminRouteError(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

export const MAX_BULK_IDS = 200;

/** 批量操作的 id 列表：去重、去空，并限制单次数量以免超出 D1 绑定参数上限。 */
export function bulkIds(body: Record<string, unknown>): string[] {
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AdminValidationError("请至少选择一项");
  }
  const ids = [
    ...new Set(
      raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    ),
  ];
  if (ids.length !== raw.length && ids.length === 0) {
    throw new AdminValidationError("请至少选择一项");
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new AdminValidationError(`一次最多操作 ${MAX_BULK_IDS} 项`);
  }
  return ids;
}
