import {
  bool,
  changed,
  type AdminChannelCredentials,
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
  base_url: string | null;
  host_header: string | null;
  has_api_key: number;
  sort_order: number;
  enabled: number;
  created_at_ms: number;
  updated_at_ms: number;
}

interface CountRow {
  count: number;
}

interface ChannelCredentialsRow {
  id: string;
  base_url: string | null;
  has_api_key: number;
}

interface ChannelSecretRow {
  base_url: string | null;
  host_header: string | null;
  api_key_ciphertext: string | null;
  api_key_nonce: string | null;
  api_key_version: number | null;
}

const HAS_API_KEY_SQL = `CASE WHEN api_key_ciphertext IS NOT NULL AND api_key_nonce IS NOT NULL
                    THEN 1 ELSE 0 END AS has_api_key`;

function toRecord(row: ChannelRow): AdminChannelRecord {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    statusPageUrl: row.status_page_url,
    baseUrl: row.base_url,
    hostHeader: row.host_header,
    hasApiKey: bool(row.has_api_key),
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
             (id, name, logo_url, website_url, status_page_url, base_url, host_header,
              api_key_ciphertext, api_key_nonce, api_key_version, sort_order,
              enabled, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.logoUrl,
          input.websiteUrl,
          input.statusPageUrl,
          input.baseUrl,
          input.hostHeader,
          input.encryptedKey?.ciphertext ?? null,
          input.encryptedKey?.nonce ?? null,
          input.encryptedKey?.version ?? 1,
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
          `SELECT id, name, logo_url, website_url, status_page_url, base_url,
                  host_header, ${HAS_API_KEY_SQL},
                  sort_order, enabled, created_at_ms, updated_at_ms
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
               base_url = ?,
               host_header = ?,
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
          input.baseUrl,
          input.hostHeader,
          input.sortOrder,
          input.enabled,
          input.nowMs,
          id
        )
        .run();
      if (!changed(result)) {
        return false;
      }

      if (input.encryptedKey) {
        await db
          .prepare(
            `UPDATE channels
             SET api_key_ciphertext = ?, api_key_nonce = ?, api_key_version = ?
             WHERE id = ?`
          )
          .bind(
            input.encryptedKey.ciphertext,
            input.encryptedKey.nonce,
            input.encryptedKey.version,
            id
          )
          .run();
      } else if (input.clearApiKey) {
        await db
          .prepare(
            `UPDATE channels
             SET api_key_ciphertext = NULL, api_key_nonce = NULL
             WHERE id = ?`
          )
          .bind(id)
          .run();
      }
      return true;
    },

    async findCredentials(id: string): Promise<AdminChannelCredentials | null> {
      const row = await db
        .prepare(
          `SELECT id, base_url, ${HAS_API_KEY_SQL}
           FROM channels
           WHERE id = ?`
        )
        .bind(id)
        .first<ChannelCredentialsRow>();
      return row
        ? { id: row.id, baseUrl: row.base_url, hasApiKey: bool(row.has_api_key) }
        : null;
    },

    async findSecret(id: string) {
      return await db
        .prepare(
          `SELECT base_url, host_header, api_key_ciphertext, api_key_nonce, api_key_version
           FROM channels
           WHERE id = ?`
        )
        .bind(id)
        .first<ChannelSecretRow>();
    },

    async configsRequiringChannelKey(id: string) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM check_configs
           WHERE channel_id = ?
             AND enabled = 1
             AND is_maintenance = 0
             AND (api_key_ciphertext IS NULL OR api_key_nonce IS NULL)`
        )
        .bind(id)
        .first<CountRow>();
      return row?.count ?? 0;
    },

    async configsRequiringChannelBaseUrl(id: string) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM check_configs
           WHERE channel_id = ?
             AND enabled = 1
             AND is_maintenance = 0
             AND TRIM(endpoint) = ''`
        )
        .bind(id)
        .first<CountRow>();
      return row?.count ?? 0;
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
