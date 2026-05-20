import type { AdminD1Executor, AdminRuntimeStatus } from "./types";

interface JobRunRow {
  id: string;
  job_name: string;
  owner_id: string;
  status: string;
  started_at_ms: number;
  finished_at_ms: number | null;
  checked_count: number;
  error_message: string | null;
}

interface JobLockRow {
  job_name: string;
  owner_id: string;
  locked_until_ms: number;
  updated_at_ms: number;
}

interface SnapshotRow {
  snapshot_key: string;
  period: string;
  generated_at_ms: number;
}

interface LatestCheckRow {
  checked_at_ms: number;
  updated_at_ms: number;
}

export function createAdminRuntimeRepository(db: AdminD1Executor) {
  return {
    async getStatus(): Promise<AdminRuntimeStatus> {
      const [runs, locks, snapshots, latestCheck] = await Promise.all([
        db
          .prepare(
            `SELECT id, job_name, owner_id, status, started_at_ms, finished_at_ms,
                    checked_count, error_message
             FROM job_runs
             ORDER BY started_at_ms DESC
             LIMIT 10`
          )
          .all<JobRunRow>(),
        db
          .prepare(
            `SELECT job_name, owner_id, locked_until_ms, updated_at_ms
             FROM job_locks
             ORDER BY updated_at_ms DESC`
          )
          .all<JobLockRow>(),
        db
          .prepare(
            `SELECT snapshot_key, period, generated_at_ms
             FROM dashboard_snapshots
             ORDER BY generated_at_ms DESC
             LIMIT 20`
          )
          .all<SnapshotRow>(),
        db
          .prepare(
            `SELECT checked_at_ms, updated_at_ms
             FROM check_latest
             ORDER BY checked_at_ms DESC
             LIMIT 1`
          )
          .first<LatestCheckRow>(),
      ]);

      return {
        cron: {
          expression: "*/1 * * * *",
          label: "每 1 分钟",
        },
        recentRuns: (runs.results ?? []).map((row) => ({
          id: row.id,
          jobName: row.job_name,
          ownerId: row.owner_id,
          status: row.status,
          startedAtMs: row.started_at_ms,
          finishedAtMs: row.finished_at_ms,
          checkedCount: row.checked_count,
          errorMessage: row.error_message,
        })),
        locks: (locks.results ?? []).map((row) => ({
          jobName: row.job_name,
          ownerId: row.owner_id,
          lockedUntilMs: row.locked_until_ms,
          updatedAtMs: row.updated_at_ms,
        })),
        snapshots: (snapshots.results ?? []).map((row) => ({
          snapshotKey: row.snapshot_key,
          period: row.period,
          generatedAtMs: row.generated_at_ms,
        })),
        latestCheck: latestCheck
          ? {
              checkedAtMs: latestCheck.checked_at_ms,
              updatedAtMs: latestCheck.updated_at_ms,
            }
          : null,
      };
    },
  };
}
