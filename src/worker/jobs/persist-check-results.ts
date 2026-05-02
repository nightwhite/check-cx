import type { WorkerCheckResult } from "../providers";

interface D1BatchExecutor {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export async function persistCheckResults(
  db: D1BatchExecutor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  for (const result of results) {
    const checkedAtMs = Date.parse(result.checkedAt);
    statements.push(
      db
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
    );

    statements.push(
      db
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
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}
