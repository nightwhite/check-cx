import type { WorkerCheckResult } from "../providers";

export interface AvailabilityRollupUpdateSummary {
  updatedPeriods: number;
}

const PERIODS = ["7d", "15d", "30d"] as const;

interface D1BatchExecutor {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

function getDayStartMs(value: number): number {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export async function updateAvailabilityRollups(
  db: D1BatchExecutor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<AvailabilityRollupUpdateSummary> {
  let updatedPeriods = 0;
  const dayStartMs = getDayStartMs(nowMs);
  const statements: D1PreparedStatement[] = [];

  for (const result of results) {
    const operationalDelta =
      result.status === "operational" || result.status === "degraded" ? 1 : 0;

    for (const period of PERIODS) {
      statements.push(
        db
          .prepare(
            `INSERT INTO availability_rollups (
               config_id,
               period,
               day_start_ms,
               total_checks,
               operational_count,
               updated_at_ms
             ) VALUES (?, ?, ?, 1, ?, ?)
             ON CONFLICT(config_id, period, day_start_ms) DO UPDATE SET
               total_checks = total_checks + 1,
               operational_count = operational_count + excluded.operational_count,
               updated_at_ms = excluded.updated_at_ms`
          )
          .bind(result.id, period, dayStartMs, operationalDelta, nowMs)
      );
      updatedPeriods++;
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return { updatedPeriods };
}
