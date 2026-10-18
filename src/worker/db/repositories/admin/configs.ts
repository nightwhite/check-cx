import { buildEndpointFromBaseUrl } from "../../../../../lib/utils/endpoint-builder";
import type { EncryptedProviderKey } from "../../../crypto/provider-key";
import {
  bool,
  changed,
  type AdminConfigRecord,
  type BulkConfigPatch,
  type AdminD1Executor,
  type AdminKeySource,
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
  channel_id: string | null;
  channel_name: string | null;
  channel_logo_url: string | null;
  channel_base_url: string | null;
  channel_has_api_key: number | null;
  endpoint: string;
  host_header: string | null;
  api_format: AdminConfigRecord["apiFormat"];
  enabled: number;
  is_maintenance: number;
  group_name: string | null;
  check_interval_seconds: number | null;
  region: string | null;
  has_api_key: number;
  created_at_ms: number;
  updated_at_ms: number;
}

interface ModelTypeRow {
  id: string;
  type: AdminProviderType;
}

interface ConfigIdRow {
  id: string;
}

interface ChannelIdRow {
  id: string;
}

interface ConfigCredentialsRow {
  id: string;
  has_api_key: number;
}

function resolveKeySource(row: ConfigRow): AdminKeySource {
  if (bool(row.has_api_key)) {
    return "config";
  }
  return bool(row.channel_has_api_key) ? "channel" : "none";
}

function resolveEffectiveEndpoint(row: ConfigRow): string | null {
  if (row.endpoint.trim()) {
    return row.endpoint;
  }
  if (!row.channel_base_url) {
    return null;
  }
  return buildEndpointFromBaseUrl({
    baseUrl: row.channel_base_url,
    type: row.type,
    apiFormat: row.api_format,
    model: row.model,
  });
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
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelLogoUrl: row.channel_logo_url,
    endpoint: row.endpoint,
    hostHeader: row.host_header,
    apiFormat: row.api_format,
    enabled: bool(row.enabled),
    isMaintenance: bool(row.is_maintenance),
    groupName: row.group_name,
    checkIntervalSeconds: row.check_interval_seconds,
    region: row.region,
    hasApiKey: bool(row.has_api_key),
    inheritsEndpoint: row.endpoint.trim().length === 0,
    keySource: resolveKeySource(row),
    effectiveEndpoint: resolveEffectiveEndpoint(row),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function bindEncryptedKey(encryptedKey: EncryptedProviderKey | null) {
  return [
    encryptedKey?.ciphertext ?? null,
    encryptedKey?.nonce ?? null,
    encryptedKey?.version ?? 1,
  ] as const;
}

export function createAdminConfigRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminConfigInput) {
      const [ciphertext, nonce, version] = bindEncryptedKey(input.encryptedKey);
      await db
        .prepare(
          `INSERT INTO check_configs
             (id, name, type, model_id, endpoint, host_header, api_format, api_key_ciphertext, api_key_nonce,
              api_key_version, enabled, is_maintenance, group_name, channel_id,
              check_interval_seconds, region, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.type,
          input.modelId,
          input.endpoint,
          input.hostHeader,
          input.apiFormat ?? "chat_completions",
          ciphertext,
          nonce,
          version,
          input.enabled,
          input.isMaintenance,
          input.groupName,
          input.channelId,
          input.checkIntervalSeconds,
          input.region,
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    /** 每个模型已被哪些渠道监控，用于导入弹窗提示「已在其他渠道监控」。 */
    async listChannelNamesByModel() {
      const rows = await db
        .prepare(
          `SELECT c.model_id, c.channel_id, ch.name AS channel_name
           FROM check_configs c
           JOIN channels ch ON ch.id = c.channel_id
           ORDER BY ch.sort_order ASC, ch.name ASC`
        )
        .all<{ model_id: string; channel_id: string; channel_name: string }>();
      const result = new Map<string, Array<{ id: string; name: string }>>();
      for (const row of rows.results ?? []) {
        const list = result.get(row.model_id) ?? [];
        if (!list.some((item) => item.id === row.channel_id)) {
          list.push({ id: row.channel_id, name: row.channel_name });
        }
        result.set(row.model_id, list);
      }
      return result;
    },

    async existsForChannelModel(channelId: string, modelId: string) {
      const row = await db
        .prepare(
          "SELECT id FROM check_configs WHERE channel_id = ? AND model_id = ? LIMIT 1"
        )
        .bind(channelId, modelId)
        .first<ConfigIdRow>();
      return Boolean(row);
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT c.id, c.name, c.type, c.model_id, m.model,
                  m.template_id, t.name AS template_name,
                  c.channel_id, ch.name AS channel_name, ch.logo_url AS channel_logo_url,
                  ch.base_url AS channel_base_url,
                  CASE WHEN ch.api_key_ciphertext IS NOT NULL AND ch.api_key_nonce IS NOT NULL
                    THEN 1 ELSE 0 END AS channel_has_api_key,
                  c.endpoint, c.host_header, c.api_format, c.enabled, c.is_maintenance, c.group_name,
                  c.check_interval_seconds, c.region,
                  CASE WHEN c.api_key_ciphertext IS NOT NULL AND c.api_key_nonce IS NOT NULL
                    THEN 1 ELSE 0 END AS has_api_key,
                  c.created_at_ms, c.updated_at_ms
           FROM check_configs c
           JOIN check_models m ON m.id = c.model_id
           LEFT JOIN check_request_templates t ON t.id = m.template_id
           LEFT JOIN channels ch ON ch.id = c.channel_id
           ORDER BY c.updated_at_ms DESC, c.created_at_ms DESC, c.name ASC`
        )
        .all<ConfigRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async findModelType(id: string) {
      return await db
        .prepare("SELECT id, type FROM check_models WHERE id = ?")
        .bind(id)
        .first<ModelTypeRow>();
    },

    async exists(id: string) {
      const row = await db
        .prepare("SELECT id FROM check_configs WHERE id = ?")
        .bind(id)
        .first<ConfigIdRow>();
      return Boolean(row);
    },

    async channelExists(id: string) {
      const row = await db
        .prepare("SELECT id FROM channels WHERE id = ?")
        .bind(id)
        .first<ChannelIdRow>();
      return Boolean(row);
    },

    async findCredentials(id: string) {
      const row = await db
        .prepare(
          `SELECT id,
                  CASE WHEN api_key_ciphertext IS NOT NULL AND api_key_nonce IS NOT NULL
                    THEN 1 ELSE 0 END AS has_api_key
           FROM check_configs
           WHERE id = ?`
        )
        .bind(id)
        .first<ConfigCredentialsRow>();
      return row ? { id: row.id, hasApiKey: bool(row.has_api_key) } : null;
    },

    async update(id: string, input: UpdateAdminConfigInput) {
      const result = await db
        .prepare(
          `UPDATE check_configs
           SET name = ?, type = ?, model_id = ?, endpoint = ?, host_header = ?, api_format = ?, enabled = ?,
               is_maintenance = ?, group_name = ?, channel_id = ?,
               check_interval_seconds = ?, region = ?, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.type,
          input.modelId,
          input.endpoint,
          input.hostHeader,
          input.apiFormat ?? "chat_completions",
          input.enabled,
          input.isMaintenance,
          input.groupName,
          input.channelId,
          input.checkIntervalSeconds,
          input.region,
          input.nowMs,
          id
        )
        .run();
      return changed(result);
    },

    async replaceSecret(
      id: string,
      encryptedKey: EncryptedProviderKey,
      nowMs: number
    ) {
      const [ciphertext, nonce, version] = bindEncryptedKey(encryptedKey);
      const result = await db
        .prepare(
          `UPDATE check_configs
           SET api_key_ciphertext = ?, api_key_nonce = ?, api_key_version = ?,
               updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(ciphertext, nonce, version, nowMs, id)
        .run();
      return changed(result);
    },

    async clearSecret(id: string, nowMs: number) {
      const result = await db
        .prepare(
          `UPDATE check_configs
           SET api_key_ciphertext = NULL, api_key_nonce = NULL, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(nowMs, id)
        .run();
      return changed(result);
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM check_configs WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },

    /** 批量修改：只更新 patch 中出现的字段。 */
    async bulkUpdate(ids: string[], patch: BulkConfigPatch, nowMs: number) {
      const assignments: string[] = [];
      const values: unknown[] = [];
      if (patch.enabled !== undefined) {
        assignments.push("enabled = ?");
        values.push(patch.enabled ? 1 : 0);
      }
      if (patch.isMaintenance !== undefined) {
        assignments.push("is_maintenance = ?");
        values.push(patch.isMaintenance ? 1 : 0);
      }
      if (patch.channelId !== undefined) {
        assignments.push("channel_id = ?");
        values.push(patch.channelId);
      }
      if (patch.apiFormat !== undefined) {
        assignments.push("api_format = ?");
        values.push(patch.apiFormat);
      }
      if (patch.checkIntervalSeconds !== undefined) {
        assignments.push("check_interval_seconds = ?");
        values.push(patch.checkIntervalSeconds);
      }
      if (assignments.length === 0 || ids.length === 0) {
        return 0;
      }
      const result = await db
        .prepare(
          `UPDATE check_configs
           SET ${assignments.join(", ")}, updated_at_ms = ?
           WHERE id IN (${ids.map(() => "?").join(", ")})`
        )
        .bind(...values, nowMs, ...ids)
        .run();
      return result.meta?.changes ?? 0;
    },

    async bulkDelete(ids: string[]) {
      if (ids.length === 0) {
        return 0;
      }
      const result = await db
        .prepare(
          `DELETE FROM check_configs WHERE id IN (${ids.map(() => "?").join(", ")})`
        )
        .bind(...ids)
        .run();
      return result.meta?.changes ?? 0;
    },

    /**
     * 复制到另一个渠道：沿用模型、类型、API 格式、频次与维护状态；
     * 端点与 Key 不复制，改为继承目标渠道，已在目标渠道监控的模型跳过。
     */
    async copyToChannel(ids: string[], channelId: string, nowMs: number) {
      if (ids.length === 0) {
        return { created: 0, skipped: 0 };
      }
      const rows = await db
        .prepare(
          `SELECT id, name, type, model_id, api_format, enabled, is_maintenance,
                  check_interval_seconds, region
           FROM check_configs
           WHERE id IN (${ids.map(() => "?").join(", ")})`
        )
        .bind(...ids)
        .all<{
          id: string;
          name: string;
          type: AdminProviderType;
          model_id: string;
          api_format: AdminConfigRecord["apiFormat"];
          enabled: number;
          is_maintenance: number;
          check_interval_seconds: number | null;
          region: string | null;
        }>();
      let created = 0;
      let skipped = 0;
      const seenModels = new Set<string>();
      for (const row of rows.results ?? []) {
        if (
          seenModels.has(row.model_id) ||
          (await this.existsForChannelModel(channelId, row.model_id))
        ) {
          skipped += 1;
          continue;
        }
        seenModels.add(row.model_id);
        await this.create({
          id: crypto.randomUUID(),
          name: row.name,
          type: row.type,
          modelId: row.model_id,
          channelId,
          endpoint: "",
          hostHeader: null,
          apiFormat: row.api_format ?? "chat_completions",
          encryptedKey: null,
          enabled: bool(row.enabled),
          isMaintenance: bool(row.is_maintenance),
          groupName: null,
          checkIntervalSeconds: row.check_interval_seconds,
          region: row.region,
          nowMs,
        });
        created += 1;
      }
      return { created, skipped };
    },
  };
}
