import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { assertProviderType, jsonToString, requireString, toEpochMs } from "./transform";
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

export async function buildCheckConfigStatements(
  inputDir: string,
  encryptionKey: string
): Promise<D1ImportStatement[]> {
  const rows = await readJsonl(inputDir, "check_configs");
  const statements: D1ImportStatement[] = [];

  for (const row of rows) {
    const encrypted = await encryptProviderKey(
      requireString(row.api_key, "api_key"),
      encryptionKey
    );
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
        row.enabled === false ? 0 : 1,
        row.is_maintenance === true ? 1 : 0,
        typeof row.group_name === "string" ? row.group_name : null,
        toEpochMs(row.created_at as string | null) ?? 0,
        toEpochMs(row.updated_at as string | null) ?? 0,
      ],
    });
  }

  return statements;
}

export function serializeD1Statements(statements: D1ImportStatement[]): string {
  return statements
    .map((statement) => {
      const params = statement.params.map((value) => jsonToString(value) ?? "NULL");
      return `${statement.sql}; -- params: ${params.join(", ")}`;
    })
    .join("\n");
}
