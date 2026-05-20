export interface AdminSessionResponse {
  authenticated?: boolean;
  error?: string;
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
  | "configs"
  | "models"
  | "templates"
  | "groups"
  | "notifications"
  | "runtime";

export type AdminProviderType = "openai" | "gemini" | "anthropic";
export type AdminNotificationLevel = "info" | "warning" | "error";

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
