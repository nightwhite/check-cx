import {
  changed,
  type AdminD1Executor,
  type AdminModelRecord,
  type AdminProviderType,
  type CreateAdminModelInput,
  type UpdateAdminModelInput,
} from "./types";

interface ModelRow {
  id: string;
  type: AdminProviderType;
  model: string;
  template_id: string | null;
  template_name: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRecord(row: ModelRow): AdminModelRecord {
  return {
    id: row.id,
    type: row.type,
    model: row.model,
    templateId: row.template_id,
    templateName: row.template_name,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createAdminModelRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminModelInput) {
      await db
        .prepare(
          `INSERT INTO check_models (id, type, model, template_id, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.type,
          input.model,
          input.templateId,
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT m.id, m.type, m.model, m.template_id, t.name AS template_name,
                  m.created_at_ms, m.updated_at_ms
           FROM check_models m
           LEFT JOIN check_request_templates t ON t.id = m.template_id
           ORDER BY m.updated_at_ms DESC, m.created_at_ms DESC, m.model ASC`
        )
        .all<ModelRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminModelInput) {
      await db
        .prepare(
          `UPDATE check_models
           SET type = ?, model = ?, template_id = ?, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(input.type, input.model, input.templateId, input.nowMs, id)
        .run();
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM check_models WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
