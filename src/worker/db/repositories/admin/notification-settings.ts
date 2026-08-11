import {
  bool,
  type AdminD1Executor,
  type AdminNotificationSettingsRecord,
  type InternalNotificationSettingsRecord,
  type UpdateAdminNotificationSettingsInput,
} from "./types";

interface NotificationSettingsRow {
  id: "default";
  lark_webhook_ciphertext: string | null;
  lark_webhook_nonce: string | null;
  enabled: number;
  notify_degraded: number;
  notify_failed: number;
  notify_recovered: number;
  created_at_ms: number;
  updated_at_ms: number;
}

function toInternalRecord(
  row: NotificationSettingsRow
): InternalNotificationSettingsRecord {
  return {
    id: row.id,
    larkWebhookCiphertext: row.lark_webhook_ciphertext,
    larkWebhookNonce: row.lark_webhook_nonce,
    enabled: bool(row.enabled),
    hasWebhookUrl: Boolean(row.lark_webhook_ciphertext && row.lark_webhook_nonce),
    notifyDegraded: bool(row.notify_degraded),
    notifyFailed: bool(row.notify_failed),
    notifyRecovered: bool(row.notify_recovered),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function toPublicNotificationSettings(
  record: InternalNotificationSettingsRecord
): AdminNotificationSettingsRecord {
  return {
    id: record.id,
    enabled: record.enabled,
    hasWebhookUrl: record.hasWebhookUrl,
    notifyDegraded: record.notifyDegraded,
    notifyFailed: record.notifyFailed,
    notifyRecovered: record.notifyRecovered,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
  };
}

export function createAdminNotificationSettingsRepository(db: AdminD1Executor) {
  async function getInternal(): Promise<InternalNotificationSettingsRecord> {
    await db
      .prepare("INSERT OR IGNORE INTO notification_settings (id) VALUES ('default')")
      .run();
    const row = await db
      .prepare(
        `SELECT id, lark_webhook_ciphertext, lark_webhook_nonce, enabled,
                notify_degraded, notify_failed, notify_recovered,
                created_at_ms, updated_at_ms
         FROM notification_settings
         WHERE id = 'default'`
      )
      .first<NotificationSettingsRow>();

    if (!row) {
      throw new Error("notification_settings default row was not created");
    }

    return toInternalRecord(row);
  }

  return {
    getInternal,

    async get() {
      return toPublicNotificationSettings(await getInternal());
    },

    async update(input: UpdateAdminNotificationSettingsInput) {
      await db
        .prepare(
          `UPDATE notification_settings
           SET lark_webhook_ciphertext = ?,
               lark_webhook_nonce = ?,
               enabled = ?,
               notify_degraded = ?,
               notify_failed = ?,
               notify_recovered = ?,
               updated_at_ms = ?
           WHERE id = 'default'`
        )
        .bind(
          input.larkWebhookCiphertext,
          input.larkWebhookNonce,
          input.enabled,
          input.notifyDegraded,
          input.notifyFailed,
          input.notifyRecovered,
          input.nowMs
        )
        .run();
      return this.get();
    },
  };
}
