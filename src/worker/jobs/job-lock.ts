export type JobRunStatus = "running" | "success" | "failed" | "skipped";

export interface JobLockStatementLike {
  bind(...values: unknown[]): JobLockStatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface JobLockExecutor {
  prepare(query: string): JobLockStatementLike;
}

export interface AcquireJobLockInput {
  jobName: string;
  ownerId: string;
  nowMs: number;
  ttlMs: number;
}

export interface RecordJobRunInput {
  id: string;
  jobName: string;
  ownerId: string;
  status: JobRunStatus;
  startedAtMs: number;
  finishedAtMs: number | null;
  checkedCount: number;
  errorMessage: string | null;
}

function getChangeCount(result: { meta?: { changes?: number } }): number {
  return result.meta?.changes ?? 0;
}

export function createJobLockRepository(db: JobLockExecutor) {
  return {
    async acquire(input: AcquireJobLockInput): Promise<boolean> {
      const lockedUntilMs = input.nowMs + input.ttlMs;
      const updated = await db
        .prepare(
          `UPDATE job_locks
           SET owner_id = ?, locked_until_ms = ?, updated_at_ms = ?
           WHERE job_name = ? AND locked_until_ms <= ?`
        )
        .bind(
          input.ownerId,
          lockedUntilMs,
          input.nowMs,
          input.jobName,
          input.nowMs
        )
        .run();

      if (getChangeCount(updated) > 0) {
        return true;
      }

      const inserted = await db
        .prepare(
          `INSERT OR IGNORE INTO job_locks (
             job_name,
             owner_id,
             locked_until_ms,
             updated_at_ms
           ) VALUES (?, ?, ?, ?)`
        )
        .bind(
          input.jobName,
          input.ownerId,
          lockedUntilMs,
          input.nowMs
        )
        .run();

      return getChangeCount(inserted) > 0;
    },

    async recordRun(input: RecordJobRunInput): Promise<void> {
      await db
        .prepare(
          `INSERT INTO job_runs (
             id,
             job_name,
             owner_id,
             status,
             started_at_ms,
             finished_at_ms,
             checked_count,
             error_message
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.jobName,
          input.ownerId,
          input.status,
          input.startedAtMs,
          input.finishedAtMs,
          input.checkedCount,
          input.errorMessage
        )
        .run();
    },
  };
}
