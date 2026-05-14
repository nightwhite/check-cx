import { decryptProviderKey } from "../../crypto/provider-key";
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
  api_key_ciphertext: string | null;
  api_key_nonce: string | null;
  api_key_version: number | null;
  is_maintenance: number;
  group_name: string | null;
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

async function decryptApiKey(
  row: ProviderConfigRow,
  encryptionKey: string
): Promise<string> {
  if (!row.api_key_ciphertext || !row.api_key_nonce) {
    if (row.is_maintenance) {
      return "";
    }
    throw new Error(`Missing encrypted API key for config ${row.id}`);
  }

  return decryptProviderKey(
    {
      ciphertext: row.api_key_ciphertext,
      nonce: row.api_key_nonce,
      version: row.api_key_version ?? 1,
    },
    encryptionKey
  );
}

export async function loadEnabledProviderConfigs(
  db: D1AllExecutor,
  encryptionKey: string
): Promise<WorkerProviderConfig[]> {
  const rows = await db
    .prepare(
      `SELECT
         c.id,
         c.name,
         c.type,
         c.endpoint,
         c.api_key_ciphertext,
         c.api_key_nonce,
         c.api_key_version,
         c.is_maintenance,
         c.group_name,
         m.model,
         t.request_header_json,
         t.metadata_json
       FROM check_configs c
       JOIN check_models m ON m.id = c.model_id AND m.type = c.type
       LEFT JOIN check_request_templates t ON t.id = m.template_id AND t.type = c.type
       WHERE c.enabled = 1
       ORDER BY c.id`
    )
    .all<ProviderConfigRow>();

  return Promise.all(
    (rows.results ?? []).map(async (row) => ({
      id: row.id,
      name: row.name,
      type: assertProviderType(row.type),
      endpoint: row.endpoint,
      model: row.model,
      apiKey: await decryptApiKey(row, encryptionKey),
      isMaintenance: Boolean(row.is_maintenance),
      requestHeaders: parseHeaderRecord(row.request_header_json),
      metadata: parseJsonRecord(row.metadata_json),
      groupName: row.group_name,
    }))
  );
}
