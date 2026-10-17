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
  /** 直连模式：通过原始 TCP 携带的 Host 头（fetch 无法覆盖 Host）。 */
  hostHeader?: string | null;
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
  /** 端点或 Key 无法解析时的配置错误，检测时直接返回 error 状态。 */
  configError?: string;
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
