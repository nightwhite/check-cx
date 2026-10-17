import type { WorkerCheckResult } from "../../providers";
import type { D1AllExecutor } from "./provider-configs";

interface LatestCheckResultRow {
  config_id: string;
  name: string;
  type: WorkerCheckResult["type"];
  endpoint: string;
  model: string;
  group_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_logo_url: string | null;
  region: string | null;
  status: WorkerCheckResult["status"];
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at_ms: number;
  message: string | null;
  log_message: string | null;
}

// 每轮 cron 只会检测到期的配置，快照需要基于全部启用配置的最新结果生成，
// 否则不同检测间隔的配置会互相覆盖，导致面板只显示本轮检测到的那部分。
export async function loadLatestCheckResults(
  db: D1AllExecutor
): Promise<WorkerCheckResult[]> {
  const rows = await db
    .prepare(
      `SELECT
         c.id AS config_id,
         c.name,
         c.type,
         c.endpoint,
         m.model,
         c.group_name,
         c.channel_id,
         ch.name AS channel_name,
         ch.logo_url AS channel_logo_url,
         c.region,
         l.status,
         l.latency_ms,
         l.ping_latency_ms,
         l.checked_at_ms,
         l.message,
         l.log_message
       FROM check_configs c
       JOIN check_latest l ON l.config_id = c.id
       JOIN check_models m ON m.id = c.model_id
       LEFT JOIN channels ch ON ch.id = c.channel_id
       WHERE c.enabled = 1
       ORDER BY c.id`
    )
    .all<LatestCheckResultRow>();

  return (rows.results ?? []).map((row) => ({
    id: row.config_id,
    name: row.name,
    type: row.type,
    endpoint: row.endpoint,
    model: row.model,
    status: row.status,
    latencyMs: row.latency_ms,
    pingLatencyMs: row.ping_latency_ms,
    checkedAt: new Date(row.checked_at_ms).toISOString(),
    message: row.message ?? "",
    logMessage: row.log_message ?? undefined,
    groupName: row.group_name,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelLogoUrl: row.channel_logo_url,
    region: row.region,
  }));
}
