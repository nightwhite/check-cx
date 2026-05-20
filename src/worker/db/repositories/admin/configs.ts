import type { EncryptedProviderKey } from "../../../crypto/provider-key";
import {
  bool,
  changed,
  type AdminConfigRecord,
  type AdminD1Executor,
  type AdminProviderType,
  type CreateAdminConfigInput,
  type UpdateAdminConfigInput,
} from "./types";

interface ConfigRow {
  id: string;
  name: string;
  type: AdminProviderType;
  model_id: string;
  model: string;
  template_id: string | null;
  template_name: string | null;
  endpoint: string;
  enabled: number;
  is_maintenance: number;
  group_name: string | null;
  has_api_key: number;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRecord(row: ConfigRow): AdminConfigRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    modelId: row.model_id,
    model: row.model,
    templateId: row.template_id,
    templateName: row.template_name,
    endpoint: row.endpoint,
    enabled: bool(row.enabled),
    isMaintenance: bool(row.is_maintenance),
    groupName: row.group_name,
    hasApiKey: bool(row.has_api_key),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function bindEncryptedKey(encryptedKey: EncryptedProviderKey) {
  return [
    encryptedKey.ciphertext,
    encryptedKey.nonce,
    encryptedKey.version,
  ] as const;
}

export function createAdminConfigRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminConfigInput) {
      const [ciphertext, nonce, version] = bindEncryptedKey(input.encryptedKey);
      await db
        .prepare(
          `INSERT INTO check_configs
             (id, name, type, model_id, endpoint, api_key_ciphertext, api_key_nonce,
              api_key_version, enabled, is_maintenance, group_name, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.type,
          input.modelId,
          input.endpoint,
          ciphertext,
          nonce,
          version,
          input.enabled,
          input.isMaintenance,
          input.groupName,
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT c.id, c.name, c.type, c.model_id, m.model,
                  m.template_id, t.name AS template_name,
                  c.endpoint, c.enabled, c.is_maintenance, c.group_name,
                  CASE WHEN c.api_key_ciphertext IS NOT NULL AND c.api_key_nonce IS NOT NULL
                    THEN 1 ELSE 0 END AS has_api_key,
                  c.created_at_ms, c.updated_at_ms
           FROM check_configs c
           JOIN check_models m ON m.id = c.model_id
           LEFT JOIN check_request_templates t ON t.id = m.template_id
           ORDER BY c.updated_at_ms DESC, c.created_at_ms DESC, c.name ASC`
        )
        .all<ConfigRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminConfigInput) {
      await db
        .prepare(
          `UPDATE check_configs
           SET name = ?, type = ?, model_id = ?, endpoint = ?, enabled = ?,
               is_maintenance = ?, group_name = ?, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.type,
          input.modelId,
          input.endpoint,
          input.enabled,
          input.isMaintenance,
          input.groupName,
          input.nowMs,
          id
        )
        .run();
    },

    async replaceSecret(
      id: string,
      encryptedKey: EncryptedProviderKey,
      nowMs: number
    ) {
      const [ciphertext, nonce, version] = bindEncryptedKey(encryptedKey);
      await db
        .prepare(
          `UPDATE check_configs
           SET api_key_ciphertext = ?, api_key_nonce = ?, api_key_version = ?,
               updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(ciphertext, nonce, version, nowMs, id)
        .run();
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM check_configs WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
