import type {
  AdminD1Executor,
  AdminSiteSettingsRecord,
  UpdateAdminSiteSettingsInput,
} from "./types";

interface SiteSettingsRow {
  id: "default";
  site_name: string;
  status_title: string;
  description: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  public_origin: string | null;
  default_check_interval_seconds: number;
  notification_cooldown_seconds: number;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRecord(row: SiteSettingsRow): AdminSiteSettingsRecord {
  return {
    id: row.id,
    siteName: row.site_name,
    statusTitle: row.status_title,
    description: row.description,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    publicOrigin: row.public_origin,
    defaultCheckIntervalSeconds: row.default_check_interval_seconds,
    notificationCooldownSeconds: row.notification_cooldown_seconds,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createAdminSiteSettingsRepository(db: AdminD1Executor) {
  async function get(): Promise<AdminSiteSettingsRecord> {
    await db
      .prepare(
        `INSERT OR IGNORE INTO site_settings
           (id, site_name, status_title)
         VALUES ('default', 'Check CX', 'AI Model Status')`
      )
      .run();

    const row = await db
      .prepare(
        `SELECT id, site_name, status_title, description, logo_url, favicon_url, public_origin,
                default_check_interval_seconds, notification_cooldown_seconds,
                created_at_ms, updated_at_ms
         FROM site_settings
         WHERE id = 'default'`
      )
      .first<SiteSettingsRow>();

    if (!row) {
      throw new Error("site_settings default row was not created");
    }

    return toRecord(row);
  }

  return {
    get,

    async update(input: UpdateAdminSiteSettingsInput) {
      await db
        .prepare(
          `UPDATE site_settings
           SET site_name = ?,
               status_title = ?,
               description = ?,
               logo_url = ?,
               favicon_url = ?,
               public_origin = ?,
               default_check_interval_seconds = ?,
               notification_cooldown_seconds = ?,
               updated_at_ms = ?
           WHERE id = 'default'`
        )
        .bind(
          input.siteName,
          input.statusTitle,
          input.description,
          input.logoUrl,
          input.faviconUrl,
          input.publicOrigin,
          input.defaultCheckIntervalSeconds,
          input.notificationCooldownSeconds,
          input.nowMs
        )
        .run();

      return get();
    },
  };
}
