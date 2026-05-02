import type { D1Executor } from "../db/repositories";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;

export async function pruneCheckHistory(
  db: D1Executor,
  nowMs: number,
  retentionDays = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const cutoffMs = nowMs - retentionDays * MS_PER_DAY;
  const result = await db
    .prepare("DELETE FROM check_history WHERE checked_at_ms < ?")
    .bind(cutoffMs)
    .run();

  return result.meta?.changes ?? 0;
}
