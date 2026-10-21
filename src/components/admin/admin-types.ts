export interface AdminSessionResponse {
  authenticated?: boolean;
  error?: string;
  turnstileSiteKey?: string | null;
  remainingAttempts?: number;
  retryAfterSeconds?: number;
}

export interface AdminSummary {
  modelCount: number;
  configCount: number;
  enabledConfigCount: number;
  maintenanceConfigCount: number;
  templateCount: number;
  groupCount: number;
  activeNotificationCount: number;
  recentErrorCount: number;
}

export type AdminView =
  | "overview"
  | "site-settings"
  | "channels"
  | "configs"
  | "models"
  | "templates"
  | "groups"
  | "notifications"
  | "notification-settings"
  | "runtime"
  | "logs";

export type AdminProviderType = "openai" | "gemini" | "anthropic";
export type AdminApiFormat = "chat_completions" | "responses";
export type AdminNotificationLevel = "info" | "warning" | "error";

export type AdminLogStatus =
  | "operational"
  | "degraded"
  | "failed"
  | "validation_failed"
  | "maintenance"
  | "error";

export interface AdminLogRecord {
  id: string;
  configId: string;
  name: string;
  type: AdminProviderType;
  channelId: string | null;
  channelName: string | null;
  model: string;
  status: AdminLogStatus;
  latencyMs: number | null;
  pingLatencyMs: number | null;
  checkedAtMs: number;
  message: string | null;
  logMessage: string | null;
}

export interface AdminLogsResponse {
  logs: AdminLogRecord[];
  total: number;
  limit: number;
  offset: number;
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
  hostHeader: string | null;
  apiFormat: AdminApiFormat;
  enabled: boolean;
  isMaintenance: boolean;
  groupName: string | null;
  checkIntervalSeconds: number | null;
  region: string | null;
  hasApiKey: boolean;
  inheritsEndpoint: boolean;
  keySource: AdminKeySource;
  effectiveEndpoint: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AdminKeySource = "config" | "channel" | "none";

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
  baseUrl: string | null;
  hasApiKey: boolean;
  sortOrder: number;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
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

export interface AdminUpstreamModel {
  id: string;
  type: AdminProviderType;
  ownedBy: string | null;
  modelExists: boolean;
  monitored: boolean;
  /** 已在其他渠道监控该模型的渠道名，仅用于提示，不影响勾选。 */
  otherChannels?: string[];
}

export interface AdminImportModelsResult {
  modelsCreated: number;
  modelsReused: number;
  configsCreated: number;
  configsSkipped: number;
}
