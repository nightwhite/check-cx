export type SupportedProviderType = "openai" | "gemini" | "anthropic";

const SUPPORTED_PROVIDER_TYPES = new Set<string>([
  "openai",
  "gemini",
  "anthropic",
]);

export function toEpochMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parsed;
}

export function jsonToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export function assertProviderType(value: string): SupportedProviderType {
  if (!SUPPORTED_PROVIDER_TYPES.has(value)) {
    throw new Error(`Unsupported provider type: ${value}`);
  }
  return value as SupportedProviderType;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return value;
}
