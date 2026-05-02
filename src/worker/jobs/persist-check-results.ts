import type { D1Executor } from "../db/repositories";
import type { WorkerCheckResult } from "../providers";

export async function persistCheckResults(
  db: D1Executor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<void> {
  for (const result of results) {
    const checkedAtMs = Date.parse(result.checkedAt);
    await db
      .prepare(
        `INSERT INTO check_history (
           id,
           config_id,
           status,
           latency_ms,
           ping_latency_ms,
           checked_at_ms,
           message,
           log_message
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        result.id,
        result.status,
        result.latencyMs,
        result.pingLatencyMs,
        checkedAtMs,
        result.message,
        result.logMessage ?? null
      )
      .run();

    await db
      .prepare(
        `INSERT INTO check_latest (
           config_id,
           status,
           latency_ms,
           ping_latency_ms,
           checked_at_ms,
           message,
           log_message,
           updated_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(config_id) DO UPDATE SET
           status = excluded.status,
           latency_ms = excluded.latency_ms,
           ping_latency_ms = excluded.ping_latency_ms,
           checked_at_ms = excluded.checked_at_ms,
           message = excluded.message,
           log_message = excluded.log_message,
           updated_at_ms = excluded.updated_at_ms`
      )
      .bind(
        result.id,
        result.status,
        result.latencyMs,
        result.pingLatencyMs,
        checkedAtMs,
        result.message,
        result.logMessage ?? null,
        nowMs
      )
      .run();
  }
}
