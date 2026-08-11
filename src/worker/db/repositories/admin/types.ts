import type { EncryptedProviderKey } from "../../../crypto/provider-key";

export type AdminProviderType = "openai" | "gemini" | "anthropic";
export type AdminApiFormat = "chat_completions" | "responses";
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
  channelId: string | null;
  channelName: string | null;
  channelLogoUrl: string | null;
  endpoint: string;
  apiFormat?: AdminApiFormat;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  checkIntervalSeconds: number | null;
  region: string | null;
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

export interface AdminSiteSettingsRecord {
  id: "default";
  siteName: string;
  statusTitle: string;
  description: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  publicOrigin: string | null;
  defaultCheckIntervalSeconds: number;
  notificationCooldownSeconds: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminChannelRecord {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminNotificationSettingsRecord {
  id: "default";
  enabled: boolean;
  hasWebhookUrl: boolean;
  notifyDegraded: boolean;
  notifyFailed: boolean;
  notifyRecovered: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface InternalNotificationSettingsRecord
  extends AdminNotificationSettingsRecord {
  larkWebhookCiphertext: string | null;
  larkWebhookNonce: string | null;
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
  channelId: string;
  endpoint: string;
  apiFormat?: AdminApiFormat;
  encryptedKey: EncryptedProviderKey;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  checkIntervalSeconds: number | null;
  region: string | null;
  nowMs: number;
}

export interface UpdateAdminConfigInput {
  name: string;
  type: AdminProviderType;
  modelId: string;
  channelId: string;
  endpoint: string;
  apiFormat?: AdminApiFormat;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  checkIntervalSeconds: number | null;
  region: string | null;
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

export type UpdateAdminSiteSettingsInput = Omit<
  AdminSiteSettingsRecord,
  "id" | "createdAtMs" | "updatedAtMs"
> & {
  nowMs: number;
};

export interface CreateAdminChannelInput {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  nowMs: number;
}

export type UpdateAdminChannelInput = Omit<CreateAdminChannelInput, "id">;

export interface UpdateAdminNotificationSettingsInput {
  larkWebhookCiphertext: string | null;
  larkWebhookNonce: string | null;
  enabled: boolean;
  notifyDegraded: boolean;
  notifyFailed: boolean;
  notifyRecovered: boolean;
  nowMs: number;
}

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
