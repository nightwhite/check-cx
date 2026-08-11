export type WorkerProviderType = "openai" | "gemini" | "anthropic";
export type WorkerApiFormat = "chat_completions" | "responses";

export type WorkerHealthStatus =
  | "operational"
  | "degraded"
  | "failed"
  | "validation_failed"
  | "maintenance"
  | "error";

export interface WorkerProviderConfig {
  id: string;
  name: string;
  type: WorkerProviderType;
  endpoint: string;
  apiFormat?: WorkerApiFormat;
  model: string;
  apiKey: string;
  isMaintenance: boolean;
  requestHeaders?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
  groupName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  channelLogoUrl?: string | null;
  checkIntervalSeconds?: number | null;
  effectiveCheckIntervalSeconds?: number;
  lastCheckedAtMs?: number | null;
  region?: string | null;
}

export interface WorkerCheckResult {
  id: string;
  name: string;
  type: WorkerProviderType;
  endpoint: string;
  model: string;
  status: WorkerHealthStatus;
  latencyMs: number | null;
  pingLatencyMs: number | null;
  checkedAt: string;
  message: string;
  logMessage?: string;
  officialStatus?: {
    status: "operational" | "degraded" | "down" | "unknown";
    message: string;
    checkedAt: string;
    affectedComponents?: string[];
  };
  groupName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  channelLogoUrl?: string | null;
  region?: string | null;
}
