import { checkProvider } from "../providers";
import type { WorkerCheckResult, WorkerProviderConfig } from "../providers";
import { createJobLockRepository } from "./job-lock";
import { persistCheckResults } from "./persist-check-results";
import { updateAvailabilityRollups } from "./update-rollups";
import { writeDashboardSnapshot } from "./write-dashboard-snapshot";

const JOB_NAME = "health-check";
const LOCK_TTL_MS = 55_000;

export interface RunHealthCheckOptions {
  ownerId?: string;
  loadConfigs?: (env: Env) => Promise<WorkerProviderConfig[]>;
  runCheck?: (config: WorkerProviderConfig) => Promise<WorkerCheckResult>;
  now?: () => number;
}

export interface RunHealthCheckResult {
  status: "success" | "failed" | "skipped";
  checkedCount: number;
  ownerId: string;
  errorMessage: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "unknown error";
}

async function defaultLoadConfigs(): Promise<WorkerProviderConfig[]> {
  return [];
}

function buildOwnerId(scheduledTime: number): string {
  return `cron-${scheduledTime}-${crypto.randomUUID()}`;
}

export async function runHealthCheckJob(
  env: Env,
  scheduledTime: number,
  options: RunHealthCheckOptions = {}
): Promise<RunHealthCheckResult> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const ownerId = options.ownerId ?? buildOwnerId(scheduledTime);
  const repository = createJobLockRepository(env.DB);
  const acquired = await repository.acquire({
    jobName: JOB_NAME,
    ownerId,
    nowMs: startedAtMs,
    ttlMs: LOCK_TTL_MS,
  });

  if (!acquired) {
    await repository.recordRun({
      id: crypto.randomUUID(),
      jobName: JOB_NAME,
      ownerId,
      status: "skipped",
      startedAtMs,
      finishedAtMs: now(),
      checkedCount: 0,
      errorMessage: "lock not acquired",
    });
    return {
      status: "skipped",
      checkedCount: 0,
      ownerId,
      errorMessage: "lock not acquired",
    };
  }

  try {
    const configs = await (options.loadConfigs ?? defaultLoadConfigs)(env);
    const runCheck = options.runCheck ?? checkProvider;
    const results = await Promise.all(
      configs
        .filter((config) => !config.isMaintenance)
        .map((config) => runCheck(config))
    );
    const finishedAtMs = now();

    await persistCheckResults(env.DB, results, finishedAtMs);
    await updateAvailabilityRollups(env.DB, results, finishedAtMs);
    await writeDashboardSnapshot(env.DB, results, finishedAtMs);

    await repository.recordRun({
      id: crypto.randomUUID(),
      jobName: JOB_NAME,
      ownerId,
      status: "success",
      startedAtMs,
      finishedAtMs,
      checkedCount: results.length,
      errorMessage: null,
    });

    return {
      status: "success",
      checkedCount: results.length,
      ownerId,
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await repository.recordRun({
      id: crypto.randomUUID(),
      jobName: JOB_NAME,
      ownerId,
      status: "failed",
      startedAtMs,
      finishedAtMs: now(),
      checkedCount: 0,
      errorMessage,
    });

    return {
      status: "failed",
      checkedCount: 0,
      ownerId,
      errorMessage,
    };
  }
}
