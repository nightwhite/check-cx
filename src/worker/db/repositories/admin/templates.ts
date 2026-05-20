import {
  changed,
  jsonString,
  parseJsonRecord,
  type AdminD1Executor,
  type AdminProviderType,
  type AdminTemplateRecord,
  type CreateAdminTemplateInput,
  type UpdateAdminTemplateInput,
} from "./types";

interface TemplateRow {
  id: string;
  name: string;
  type: AdminProviderType;
  request_header_json: string | null;
  metadata_json: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRecord(row: TemplateRow): AdminTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    requestHeader: parseJsonRecord(row.request_header_json),
    metadata: parseJsonRecord(row.metadata_json),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createAdminTemplateRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminTemplateInput) {
      await db
        .prepare(
          `INSERT INTO check_request_templates
             (id, name, type, request_header_json, metadata_json, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.type,
          jsonString(input.requestHeader),
          jsonString(input.metadata),
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT id, name, type, request_header_json, metadata_json, created_at_ms, updated_at_ms
           FROM check_request_templates
           ORDER BY updated_at_ms DESC, created_at_ms DESC, name ASC`
        )
        .all<TemplateRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminTemplateInput) {
      const result = await db
        .prepare(
          `UPDATE check_request_templates
           SET name = ?, type = ?, request_header_json = ?, metadata_json = ?, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.type,
          jsonString(input.requestHeader),
          jsonString(input.metadata),
          input.nowMs,
          id
        )
        .run();
      return changed(result);
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM check_request_templates WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
