import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertProviderType,
  jsonToString,
  requireString,
  toEpochMs,
} from "./transform";
import { encryptProviderKey } from "./encrypt-provider-keys";

export interface D1ImportStatement {
  sql: string;
  params: unknown[];
}

async function readJsonl(inputDir: string, table: string) {
  const content = await readFile(join(inputDir, `${table}.jsonl`), "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanToInteger(value: unknown, defaultValue: boolean): number {
  return value === undefined ? (defaultValue ? 1 : 0) : value === true ? 1 : 0;
}

function createdAtMs(row: Record<string, unknown>): number {
  return toEpochMs(row.created_at as string | null) ?? 0;
}

function updatedAtMs(row: Record<string, unknown>): number {
  return toEpochMs(row.updated_at as string | null) ?? createdAtMs(row);
}

function apiKeyForImport(row: Record<string, unknown>): string {
  if (typeof row.api_key === "string" && row.api_key.length > 0) {
    return row.api_key;
  }
  if (row.is_maintenance === true) {
    return "maintenance-keyless-config";
  }
  return requireString(row.api_key, "api_key");
}

export async function buildTemplateStatements(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_request_templates");
  return rows.map((row) => ({
    sql: `INSERT INTO check_request_templates (
      id, name, type, request_header_json, metadata_json, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      requireString(row.id, "id"),
      requireString(row.name, "name"),
      assertProviderType(requireString(row.type, "type")),
      jsonToString(row.request_header),
      jsonToString(row.metadata),
      createdAtMs(row),
      updatedAtMs(row),
    ],
  }));
}

export async function buildModelStatements(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_models");
  return rows.map((row) => ({
    sql: `INSERT INTO check_models (
      id, type, model, template_id, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      requireString(row.id, "id"),
      assertProviderType(requireString(row.type, "type")),
      requireString(row.model, "model"),
      optionalString(row.template_id),
      createdAtMs(row),
      updatedAtMs(row),
    ],
  }));
}

export async function buildCheckConfigStatements(
  inputDir: string,
  encryptionKey: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_configs");
  const statements: D1ImportStatement[] = [];

  for (const row of rows) {
    const encrypted = await encryptProviderKey(apiKeyForImport(row), encryptionKey);
    statements.push({
      sql: `INSERT INTO check_configs (
        id, name, type, model_id, endpoint, api_key_ciphertext, api_key_nonce,
        api_key_version, enabled, is_maintenance, group_name, created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        requireString(row.id, "id"),
        requireString(row.name, "name"),
        assertProviderType(requireString(row.type, "type")),
        requireString(row.model_id, "model_id"),
        requireString(row.endpoint, "endpoint"),
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.version,
        booleanToInteger(row.enabled, true),
        booleanToInteger(row.is_maintenance, false),
        optionalString(row.group_name),
        createdAtMs(row),
        updatedAtMs(row),
      ],
    });
  }

  return statements;
}

export async function buildHistoryStatements(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_history");
  return rows.map((row) => ({
    sql: `INSERT INTO check_history (
      id, config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message, log_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      String(row.id ?? crypto.randomUUID()),
      requireString(row.config_id, "config_id"),
      requireString(row.status, "status"),
      row.latency_ms ?? null,
      row.ping_latency_ms ?? null,
      toEpochMs(requireString(row.checked_at, "checked_at")),
      row.message ?? null,
      row.log_message ?? null,
    ],
  }));
}

export async function buildLatestStatementsFromHistory(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_history");
  const latestByConfig = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const configId = requireString(row.config_id, "config_id");
    const checkedAtMs = toEpochMs(requireString(row.checked_at, "checked_at")) ?? 0;
    const existing = latestByConfig.get(configId);
    const existingCheckedAtMs = existing
      ? toEpochMs(requireString(existing.checked_at, "checked_at")) ?? 0
      : -1;

    if (checkedAtMs >= existingCheckedAtMs) {
      latestByConfig.set(configId, row);
    }
  }

  return [...latestByConfig.values()].map((row) => {
    const checkedAtMs = toEpochMs(requireString(row.checked_at, "checked_at")) ?? 0;
    return {
      sql: `INSERT INTO check_latest (
        config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message, log_message, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(config_id) DO UPDATE SET
        status = excluded.status,
        latency_ms = excluded.latency_ms,
        ping_latency_ms = excluded.ping_latency_ms,
        checked_at_ms = excluded.checked_at_ms,
        message = excluded.message,
        log_message = excluded.log_message,
        updated_at_ms = excluded.updated_at_ms`,
      params: [
        requireString(row.config_id, "config_id"),
        requireString(row.status, "status"),
        row.latency_ms ?? null,
        row.ping_latency_ms ?? null,
        checkedAtMs,
        row.message ?? null,
        row.log_message ?? null,
        checkedAtMs,
      ],
    };
  });
}

export async function buildGroupInfoStatements(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "group_info");
  return rows.map((row) => ({
    sql: `INSERT INTO group_info (
      id, group_name, website_url, tags, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      requireString(row.id, "id"),
      requireString(row.group_name, "group_name"),
      optionalString(row.website_url),
      optionalString(row.tags),
      createdAtMs(row),
      updatedAtMs(row),
    ],
  }));
}

export async function buildNotificationStatements(
  inputDir: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "system_notifications");
  return rows.map((row) => ({
    sql: `INSERT INTO system_notifications (
      id, message, is_active, level, created_at_ms
    ) VALUES (?, ?, ?, ?, ?)`,
    params: [
      requireString(row.id, "id"),
      requireString(row.message, "message"),
      booleanToInteger(row.is_active, true),
      optionalString(row.level) ?? "info",
      createdAtMs(row),
    ],
  }));
}

export async function buildAllD1ImportStatements(
  inputDir: string,
  encryptionKey: string
): Promise<D1ImportStatement[]> {
  return [
    ...(await buildTemplateStatements(inputDir)),
    ...(await buildModelStatements(inputDir)),
    ...(await buildCheckConfigStatements(inputDir, encryptionKey)),
    ...(await buildHistoryStatements(inputDir)),
    ...(await buildLatestStatementsFromHistory(inputDir)),
    ...(await buildGroupInfoStatements(inputDir)),
    ...(await buildNotificationStatements(inputDir)),
  ];
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function serializeD1Statements(statements: D1ImportStatement[]): string {
  return statements
    .map((statement) => {
      let index = 0;
      const sql = statement.sql.replace(/\?/g, () => {
        const value = statement.params[index];
        index++;
        return sqlLiteral(value);
      });
      return `${sql};`;
    })
    .join("\n");
}

export async function runD1ImportCli(argv = process.argv): Promise<void> {
  const inputDir = argv[2];
  const encryptionKey = process.env.CONFIG_ENCRYPTION_KEY;
  if (!inputDir || !encryptionKey) {
    throw new Error("Usage: CONFIG_ENCRYPTION_KEY=... tsx import-d1.ts <input-dir>");
  }

  const statements = await buildAllD1ImportStatements(inputDir, encryptionKey);
  process.stdout.write(`${serializeD1Statements(statements)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runD1ImportCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
