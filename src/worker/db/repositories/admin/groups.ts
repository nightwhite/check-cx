import {
  changed,
  type AdminD1Executor,
  type AdminGroupRecord,
  type CreateAdminGroupInput,
  type UpdateAdminGroupInput,
} from "./types";

interface GroupRow {
  id: string;
  group_name: string;
  website_url: string | null;
  tags: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRecord(row: GroupRow): AdminGroupRecord {
  return {
    id: row.id,
    groupName: row.group_name,
    websiteUrl: row.website_url,
    tags: row.tags ?? "",
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createAdminGroupRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminGroupInput) {
      await db
        .prepare(
          `INSERT INTO group_info
             (id, group_name, website_url, tags, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.groupName,
          input.websiteUrl,
          input.tags,
          input.nowMs,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT id, group_name, website_url, tags, created_at_ms, updated_at_ms
           FROM group_info
           ORDER BY updated_at_ms DESC, created_at_ms DESC, group_name ASC`
        )
        .all<GroupRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminGroupInput) {
      await db
        .prepare(
          `UPDATE group_info
           SET group_name = ?, website_url = ?, tags = ?, updated_at_ms = ?
           WHERE id = ?`
        )
        .bind(input.groupName, input.websiteUrl, input.tags, input.nowMs, id)
        .run();
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM group_info WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
