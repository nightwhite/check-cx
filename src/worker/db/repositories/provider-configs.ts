import { buildEndpointFromBaseUrl } from "../../../../lib/utils/endpoint-builder";
import {
  decryptProviderKey,
  type EncryptedProviderKey,
} from "../../crypto/provider-key";
import type { WorkerProviderConfig, WorkerProviderType } from "../../providers";

export interface D1StatementWithAll {
  bind(...values: unknown[]): D1StatementWithAll;
  all<T>(): Promise<{ results?: T[] }>;
}

export interface D1AllExecutor {
  prepare(query: string): D1StatementWithAll;
}

interface ProviderConfigRow {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  host_header: string | null;
  api_format: WorkerProviderConfig["apiFormat"];
  api_key_ciphertext: string | null;
  api_key_nonce: string | null;
  api_key_version: number | null;
  is_maintenance: number;
  group_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_logo_url: string | null;
  channel_base_url: string | null;
  channel_host_header: string | null;
  channel_api_key_ciphertext: string | null;
  channel_api_key_nonce: string | null;
  channel_api_key_version: number | null;
  check_interval_seconds: number | null;
  effective_check_interval_seconds: number;
  last_checked_at_ms: number | null;
  region: string | null;
  model: string;
  request_header_json: string | null;
  metadata_json: string | null;
}

const PROVIDER_TYPES = new Set<string>(["openai", "gemini", "anthropic"]);

function assertProviderType(value: string): WorkerProviderType {
  if (!PROVIDER_TYPES.has(value)) {
    throw new Error(`Unsupported provider type: ${value}`);
  }

  return value as WorkerProviderType;
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function parseHeaderRecord(value: string | null): Record<string, string> | null {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }

  const entries = Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function toEncryptedKey(
  ciphertext: string | null,
  nonce: string | null,
  version: number | null
): EncryptedProviderKey | null {
  if (!ciphertext || !nonce) {
    return null;
  }
  return { ciphertext, nonce, version: version ?? 1 };
}

interface ResolvedCredentials {
  endpoint: string;
  apiKey: string;
  configError?: string;
}

// 监控项自身的端点 / Key 优先，留空时继承所属渠道的 Base URL / Key。
// 无法解析时不抛异常，交给检测阶段返回 error，避免拖垮整轮任务。
async function resolveCredentials(
  row: ProviderConfigRow,
  encryptionKey: string
): Promise<ResolvedCredentials> {
  const ownEndpoint = row.endpoint.trim();
  const endpoint =
    ownEndpoint ||
    (row.channel_base_url
      ? buildEndpointFromBaseUrl({
          baseUrl: row.channel_base_url,
          type: assertProviderType(row.type),
          apiFormat: row.api_format,
          model: row.model,
        }) ?? ""
      : "");
  const encryptedKey =
    toEncryptedKey(
      row.api_key_ciphertext,
      row.api_key_nonce,
      row.api_key_version
    ) ??
    toEncryptedKey(
      row.channel_api_key_ciphertext,
      row.channel_api_key_nonce,
      row.channel_api_key_version
    );

  if (row.is_maintenance) {
    return { endpoint, apiKey: "" };
  }
  if (!endpoint) {
    return { endpoint, apiKey: "", configError: "渠道未配置 Base URL" };
  }
  if (!encryptedKey) {
    return { endpoint, apiKey: "", configError: "未配置 API Key" };
  }

  try {
    return {
      endpoint,
      apiKey: await decryptProviderKey(encryptedKey, encryptionKey),
    };
  } catch {
    return { endpoint, apiKey: "", configError: "API Key 解密失败" };
  }
}

export async function loadEnabledProviderConfigs(
  db: D1AllExecutor,
  encryptionKey: string,
  nowMs = Date.now()
): Promise<WorkerProviderConfig[]> {
  const rows = await db
    .prepare(
      `WITH site AS (
         SELECT default_check_interval_seconds
         FROM site_settings
         WHERE id = 'default'
       )
       SELECT
         c.id,
         c.name,
         c.type,
         c.endpoint,
         c.host_header,
         c.api_format,
         c.api_key_ciphertext,
         c.api_key_nonce,
         c.api_key_version,
         c.is_maintenance,
         c.group_name,
         c.channel_id,
         ch.name AS channel_name,
         ch.logo_url AS channel_logo_url,
         ch.base_url AS channel_base_url,
         ch.host_header AS channel_host_header,
         ch.api_key_ciphertext AS channel_api_key_ciphertext,
         ch.api_key_nonce AS channel_api_key_nonce,
         ch.api_key_version AS channel_api_key_version,
         c.check_interval_seconds,
         COALESCE(c.check_interval_seconds, site.default_check_interval_seconds)
           AS effective_check_interval_seconds,
         c.last_checked_at_ms,
         c.region,
         m.model,
         t.request_header_json,
         t.metadata_json
       FROM check_configs c
       JOIN site
       JOIN check_models m ON m.id = c.model_id AND m.type = c.type
       LEFT JOIN channels ch ON ch.id = c.channel_id
       LEFT JOIN check_request_templates t ON t.id = m.template_id AND t.type = c.type
       WHERE c.enabled = 1
         AND (
           c.last_checked_at_ms IS NULL
           OR c.last_checked_at_ms <= ? - (
             COALESCE(c.check_interval_seconds, site.default_check_interval_seconds) * 1000
           )
         )
       ORDER BY c.id`
    )
    .bind(nowMs)
    .all<ProviderConfigRow>();

  return Promise.all(
    (rows.results ?? []).map(async (row) => {
      const { endpoint, apiKey, configError } = await resolveCredentials(
        row,
        encryptionKey
      );
      return {
        id: row.id,
        name: row.name,
        type: assertProviderType(row.type),
        endpoint,
        // 渠道直连 Host 与渠道 Base URL 配套，只在监控项继承渠道端点时生效
        hostHeader:
          row.host_header ??
          (row.endpoint.trim() ? null : row.channel_host_header),
        apiFormat: row.api_format,
        model: row.model,
        apiKey,
        ...(configError ? { configError } : {}),
        isMaintenance: Boolean(row.is_maintenance),
        requestHeaders: parseHeaderRecord(row.request_header_json),
        metadata: parseJsonRecord(row.metadata_json),
        groupName: row.group_name,
        channelId: row.channel_id,
        channelName: row.channel_name,
        channelLogoUrl: row.channel_logo_url,
        checkIntervalSeconds: row.check_interval_seconds,
        effectiveCheckIntervalSeconds: row.effective_check_interval_seconds,
        lastCheckedAtMs: row.last_checked_at_ms,
        region: row.region,
      };
    })
  );
}
