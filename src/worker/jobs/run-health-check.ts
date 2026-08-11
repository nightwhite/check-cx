import { checkProvider } from "../providers";
import type {
  WorkerCheckResult,
  WorkerHealthStatus,
  WorkerProviderConfig,
} from "../providers";
import { decryptProviderKey } from "../crypto/provider-key";
import { loadEnabledProviderConfigs } from "../db/repositories";
import { createJobLockRepository } from "./job-lock";
import { processNotificationEvents } from "./notification-events";
import { persistCheckResults } from "./persist-check-results";
import { pruneCheckHistory } from "./prune-check-history";
import { runProviderChecks } from "./run-checks";
import { updateAvailabilityRollups } from "./update-rollups";
import { writeDashboardSnapshot } from "./write-dashboard-snapshot";
import { writeOfficialStatusSnapshots } from "./write-official-status-snapshots";

const JOB_NAME = "health-check";
const LOCK_TTL_MS = 10 * 60_000;

export interface RunHealthCheckOptions {
  ownerId?: string;
  loadConfigs?: (env: Env) => Promise<WorkerProviderConfig[]>;
  runCheck?: (config: WorkerProviderConfig) => Promise<WorkerCheckResult>;
  writeOfficialStatuses?: (env: Env) => Promise<unknown>;
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

function getConfigEncryptionKey(env: Env): string {
  const value = env.CONFIG_ENCRYPTION_KEY;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required");
  }
  return value;
}

function buildOwnerId(scheduledTime: number): string {
  return `cron-${scheduledTime}-${crypto.randomUUID()}`;
}

function isHistoryResult(result: WorkerCheckResult): boolean {
  return result.status !== "maintenance";
}

interface PreviousStatusRow {
  config_id: string;
  status: WorkerHealthStatus;
}

interface SiteSettingsRow {
  site_name: string;
  public_origin: string | null;
  notification_cooldown_seconds: number;
}

interface NotificationSettingsRow {
  enabled: number;
  lark_webhook_ciphertext: string | null;
  lark_webhook_nonce: string | null;
  notify_degraded: number;
  notify_failed: number;
  notify_recovered: number;
}

async function loadPreviousStatuses(env: Env, configIds: string[]) {
  const statuses = new Map<string, WorkerHealthStatus>();
  for (const configId of configIds) {
    const row = await env.DB.prepare(
      "SELECT config_id, status FROM check_latest WHERE config_id = ?"
    )
      .bind(configId)
      .first<PreviousStatusRow>();
    if (row) {
      statuses.set(row.config_id, row.status);
    }
  }
  return statuses;
}

async function loadNotificationContext(env: Env) {
  const siteRow = await env.DB.prepare(
    `SELECT site_name, public_origin, notification_cooldown_seconds
     FROM site_settings
     WHERE id = 'default'`
  ).first<SiteSettingsRow>();
  const settingsRow = await env.DB.prepare(
    `SELECT enabled, lark_webhook_ciphertext, lark_webhook_nonce,
            notify_degraded, notify_failed, notify_recovered
     FROM notification_settings
     WHERE id = 'default'`
  ).first<NotificationSettingsRow>();

  if (!siteRow || !settingsRow) {
    return null;
  }

  const webhookUrl =
    settingsRow.lark_webhook_ciphertext && settingsRow.lark_webhook_nonce
      ? await decryptProviderKey(
          {
            ciphertext: settingsRow.lark_webhook_ciphertext,
            nonce: settingsRow.lark_webhook_nonce,
            version: 1,
          },
          getConfigEncryptionKey(env)
        )
      : null;

  return {
    site: {
      siteName: siteRow.site_name,
      publicOrigin: siteRow.public_origin,
      notificationCooldownSeconds: siteRow.notification_cooldown_seconds,
    },
    settings: {
      enabled: settingsRow.enabled === 1,
      webhookUrl,
      notifyDegraded: settingsRow.notify_degraded === 1,
      notifyFailed: settingsRow.notify_failed === 1,
      notifyRecovered: settingsRow.notify_recovered === 1,
    },
  };
}

export function shouldPruneCheckHistory(nowMs: number): boolean {
  return new Date(nowMs).getUTCMinutes() === 0;
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
    const configs = options.loadConfigs
      ? await options.loadConfigs(env)
      : await loadEnabledProviderConfigs(
          env.DB,
          getConfigEncryptionKey(env),
          startedAtMs
        );
    const runCheck = options.runCheck ?? checkProvider;
    const previousStatuses = await loadPreviousStatuses(
      env,
      configs.map((config) => config.id)
    );
    const results = await runProviderChecks(configs, runCheck);
    const historyResults = results.filter(isHistoryResult);
    const snapshotAtMs = now();

    await persistCheckResults(env.DB, results, snapshotAtMs, {
      shouldWriteHistory: isHistoryResult,
    });
    const notificationContext = await loadNotificationContext(env);
    if (notificationContext) {
      await processNotificationEvents({
        db: env.DB,
        results,
        previousStatuses,
        site: notificationContext.site,
        settings: notificationContext.settings,
        nowMs: snapshotAtMs,
      });
    }
    await updateAvailabilityRollups(env.DB, historyResults, snapshotAtMs);
    if (options.writeOfficialStatuses) {
      await options.writeOfficialStatuses(env);
    } else {
      await writeOfficialStatusSnapshots(env.DB);
    }
    if (results.length > 0) {
      await writeDashboardSnapshot(env.DB, results, snapshotAtMs);
    }
    if (shouldPruneCheckHistory(scheduledTime)) {
      await pruneCheckHistory(env.DB, snapshotAtMs);
    }
    const finishedAtMs = now();

    try {
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
    } finally {
      await repository.release({
        jobName: JOB_NAME,
        ownerId,
        nowMs: finishedAtMs,
      });
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    try {
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
    } catch {
      // The owner lock must not outlive the active job when job_runs writing fails.
    } finally {
      await repository.release({
        jobName: JOB_NAME,
        ownerId,
        nowMs: now(),
      });
    }

    return {
      status: "failed",
      checkedCount: 0,
      ownerId,
      errorMessage,
    };
  }
}
