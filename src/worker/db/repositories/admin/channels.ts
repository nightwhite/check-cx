import {
  bool,
  changed,
  type AdminChannelRecord,
  type AdminD1Executor,
  type CreateAdminChannelInput,
  type UpdateAdminChannelInput,
} from "./types";

interface ChannelRow {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  status_page_url: string | null;
  sort_order: number;
  enabled: number;
  created_at_ms: number;
  updated_at_ms: number;
}

interface CountRow {
  count: number;
}

function toRecord(row: ChannelRow): AdminChannelRecord {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    statusPageUrl: row.status_page_url,
    sortOrder: row.sort_order,
    enabled: bool(row.enabled),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createAdminChannelRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminChannelInput) {
      await db
        .prepare(
          `INSERT INTO channels
             (id, name, logo_url, website_url, status_page_url, sort_order,
              enabled, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.logoUrl,
          input.websiteUrl,
          input.statusPageUrl,
          input.sortOrder,
          input.enabled,
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT id, name, logo_url, website_url, status_page_url, sort_order,
                  enabled, created_at_ms, updated_at_ms
           FROM channels
           ORDER BY sort_order ASC, name ASC`
        )
        .all<ChannelRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminChannelInput) {
      const result = await db
        .prepare(
          `UPDATE channels
           SET name = ?,
               logo_url = ?,
               website_url = ?,
               status_page_url = ?,
               sort_order = ?,
               enabled = ?,
               updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.logoUrl,
          input.websiteUrl,
          input.statusPageUrl,
          input.sortOrder,
          input.enabled,
          input.nowMs,
          id
        )
        .run();
      return changed(result);
    },

    async usedByConfigs(id: string) {
      const row = await db
        .prepare("SELECT COUNT(*) AS count FROM check_configs WHERE channel_id = ?")
        .bind(id)
        .first<CountRow>();
      return (row?.count ?? 0) > 0;
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM channels WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
