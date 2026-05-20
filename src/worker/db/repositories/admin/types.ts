import type { EncryptedProviderKey } from "../../../crypto/provider-key";

export type AdminProviderType = "openai" | "gemini" | "anthropic";
export type AdminNotificationLevel = "info" | "warning" | "error";

export interface AdminD1Statement {
  bind(...values: unknown[]): AdminD1Statement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface AdminD1Executor {
  prepare(query: string): AdminD1Statement;
}

export interface AdminTemplateRecord {
  id: string;
  name: string;
  type: AdminProviderType;
  requestHeader: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminModelRecord {
  id: string;
  type: AdminProviderType;
  model: string;
  templateId: string | null;
  templateName: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminConfigRecord {
  id: string;
  name: string;
  type: AdminProviderType;
  modelId: string;
  model: string;
  templateId: string | null;
  templateName: string | null;
  endpoint: string;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  hasApiKey: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminGroupRecord {
  id: string;
  groupName: string;
  websiteUrl: string | null;
  tags: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminNotificationRecord {
  id: string;
  message: string;
  level: AdminNotificationLevel;
  isActive: boolean;
  createdAtMs: number;
}

export interface CreateAdminTemplateInput {
  id: string;
  name: string;
  type: AdminProviderType;
  requestHeader: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  nowMs: number;
}

export type UpdateAdminTemplateInput = Omit<CreateAdminTemplateInput, "id">;

export interface CreateAdminModelInput {
  id: string;
  type: AdminProviderType;
  model: string;
  templateId: string | null;
  nowMs: number;
}

export type UpdateAdminModelInput = Omit<CreateAdminModelInput, "id">;

export interface CreateAdminConfigInput {
  id: string;
  name: string;
  type: AdminProviderType;
  modelId: string;
  endpoint: string;
  encryptedKey: EncryptedProviderKey;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  nowMs: number;
}

export interface UpdateAdminConfigInput {
  name: string;
  type: AdminProviderType;
  modelId: string;
  endpoint: string;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  nowMs: number;
}

export interface CreateAdminGroupInput {
  id: string;
  groupName: string;
  websiteUrl: string | null;
  tags: string;
  nowMs: number;
}

export type UpdateAdminGroupInput = Omit<CreateAdminGroupInput, "id">;

export interface CreateAdminNotificationInput {
  id: string;
  message: string;
  level: AdminNotificationLevel;
  isActive: boolean;
  nowMs: number;
}

export type UpdateAdminNotificationInput = Omit<
  CreateAdminNotificationInput,
  "id" | "nowMs"
>;

export interface AdminRuntimeStatus {
  cron: {
    expression: "*/1 * * * *";
    label: "每 1 分钟";
  };
  recentRuns: Array<{
    id: string;
    jobName: string;
    ownerId: string;
    status: string;
    startedAtMs: number;
    finishedAtMs: number | null;
    checkedCount: number;
    errorMessage: string | null;
  }>;
  locks: Array<{
    jobName: string;
    ownerId: string;
    lockedUntilMs: number;
    updatedAtMs: number;
  }>;
  snapshots: Array<{
    snapshotKey: string;
    period: string;
    generatedAtMs: number;
  }>;
  latestCheck: {
    checkedAtMs: number;
    updatedAtMs: number;
  } | null;
}

export function jsonString(value: Record<string, unknown> | null): string | null {
  return value ? JSON.stringify(value) : null;
}

export function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

export function bool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export function changed(result: { meta?: { changes?: number } }): boolean {
  return (result.meta?.changes ?? 0) > 0;
}
