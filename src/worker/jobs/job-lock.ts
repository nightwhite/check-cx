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

interface JobLockRow {
  job_name: string;
  owner_id: string;
  locked_until_ms: number;
  updated_at_ms: number;
}

export function createJobLockRepository(db: JobLockExecutor) {
  return {
    async acquire(input: AcquireJobLockInput): Promise<boolean> {
      const existing = await db
        .prepare(
          "SELECT job_name, owner_id, locked_until_ms, updated_at_ms FROM job_locks WHERE job_name = ?"
        )
        .bind(input.jobName)
        .first<JobLockRow>();

      if (existing && existing.locked_until_ms > input.nowMs) {
        return false;
      }

      await db
        .prepare(
          `INSERT INTO job_locks (job_name, owner_id, locked_until_ms, updated_at_ms)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(job_name) DO UPDATE SET
             owner_id = excluded.owner_id,
             locked_until_ms = excluded.locked_until_ms,
             updated_at_ms = excluded.updated_at_ms`
        )
        .bind(
          input.jobName,
          input.ownerId,
          input.nowMs + input.ttlMs,
          input.nowMs
        )
        .run();

      return true;
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
