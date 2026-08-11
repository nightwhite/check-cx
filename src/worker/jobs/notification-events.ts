import type { WorkerCheckResult, WorkerHealthStatus } from "../providers";
import {
  sendLarkNotification,
  type LarkNotificationInput,
} from "../notifications/lark-webhook";

type NotificationEventType = "degraded" | "failed" | "recovered";

export interface NotificationEventStatement {
  bind(...values: unknown[]): NotificationEventStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface NotificationEventExecutor {
  prepare(query: string): NotificationEventStatement;
}

export interface NotificationEventSiteSettings {
  siteName: string;
  publicOrigin: string | null;
  notificationCooldownSeconds: number;
}

export interface NotificationEventSettings {
  enabled: boolean;
  webhookUrl: string | null;
  notifyDegraded: boolean;
  notifyFailed: boolean;
  notifyRecovered: boolean;
}

interface ProcessNotificationEventsInput {
  db: NotificationEventExecutor;
  results: WorkerCheckResult[];
  previousStatuses: Map<string, WorkerHealthStatus>;
  site: NotificationEventSiteSettings;
  settings: NotificationEventSettings;
  nowMs: number;
  send?: (input: LarkNotificationInput) => Promise<void>;
}

interface RecentEventRow {
  sent_at_ms: number;
}

function eventTypeForStatus(
  previous: WorkerHealthStatus | undefined,
  current: WorkerHealthStatus
): NotificationEventType | null {
  if (current === "maintenance") {
    return null;
  }
  if (current === "degraded" && previous !== "degraded") {
    return "degraded";
  }
  if (
    (current === "failed" ||
      current === "validation_failed" ||
      current === "error") &&
    previous !== current
  ) {
    return "failed";
  }
  if (
    current === "operational" &&
    previous &&
    previous !== "operational" &&
    previous !== "maintenance"
  ) {
    return "recovered";
  }
  return null;
}

function eventEnabled(
  eventType: NotificationEventType,
  settings: NotificationEventSettings
) {
  if (eventType === "degraded") {
    return settings.notifyDegraded;
  }
  if (eventType === "failed") {
    return settings.notifyFailed;
  }
  return settings.notifyRecovered;
}

async function hasRecentEvent(
  db: NotificationEventExecutor,
  configId: string,
  eventType: NotificationEventType,
  cooldownStartMs: number
) {
  const row = await db
    .prepare(
      `SELECT sent_at_ms
       FROM notification_events
       WHERE config_id = ?
         AND event_type = ?
         AND sent_at_ms >= ?
       ORDER BY sent_at_ms DESC
       LIMIT 1`
    )
    .bind(configId, eventType, cooldownStartMs)
    .first<RecentEventRow>();
  return Boolean(row);
}

async function recordNotificationEvent(
  db: NotificationEventExecutor,
  result: WorkerCheckResult,
  eventType: NotificationEventType,
  sentAtMs: number,
  message: string | null
) {
  await db
    .prepare(
      `INSERT INTO notification_events
         (id, config_id, event_type, status, sent_at_ms, message, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      result.id,
      eventType,
      eventType === "recovered" ? "operational" : result.status,
      sentAtMs,
      message,
      sentAtMs
    )
    .run();
}

export async function processNotificationEvents(
  input: ProcessNotificationEventsInput
): Promise<void> {
  if (!input.settings.enabled || !input.settings.webhookUrl) {
    return;
  }

  const send = input.send ?? sendLarkNotification;
  const cooldownStartMs =
    input.nowMs - input.site.notificationCooldownSeconds * 1000;

  for (const result of input.results) {
    const eventType = eventTypeForStatus(
      input.previousStatuses.get(result.id),
      result.status
    );
    if (!eventType || !eventEnabled(eventType, input.settings)) {
      continue;
    }
    if (
      await hasRecentEvent(input.db, result.id, eventType, cooldownStartMs)
    ) {
      continue;
    }

    try {
      await send({
        webhookUrl: input.settings.webhookUrl,
        siteName: input.site.siteName,
        publicOrigin: input.site.publicOrigin,
        channelName: result.channelName ?? "未配置",
        model: result.model,
        status: eventType,
        latencyMs: result.latencyMs,
        message: result.message,
        checkedAt: result.checkedAt,
      });
      await recordNotificationEvent(input.db, result, eventType, input.nowMs, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordNotificationEvent(input.db, result, eventType, input.nowMs, message);
    }
  }
}
