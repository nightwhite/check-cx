export type WorkerProviderType = "openai" | "gemini" | "anthropic";

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
  model: string;
  apiKey: string;
  isMaintenance: boolean;
  requestHeaders?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
  groupName?: string | null;
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
  groupName?: string | null;
}
