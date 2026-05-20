import {
  bool,
  changed,
  type AdminD1Executor,
  type AdminNotificationLevel,
  type AdminNotificationRecord,
  type CreateAdminNotificationInput,
  type UpdateAdminNotificationInput,
} from "./types";

interface NotificationRow {
  id: string;
  message: string;
  is_active: number;
  level: AdminNotificationLevel;
  created_at_ms: number;
}

function toRecord(row: NotificationRow): AdminNotificationRecord {
  return {
    id: row.id,
    message: row.message,
    isActive: bool(row.is_active),
    level: row.level,
    createdAtMs: row.created_at_ms,
  };
}

export function createAdminNotificationRepository(db: AdminD1Executor) {
  return {
    async create(input: CreateAdminNotificationInput) {
      await db
        .prepare(
          `INSERT INTO system_notifications
             (id, message, is_active, level, created_at_ms)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.message,
          input.isActive,
          input.level,
          input.nowMs
        )
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT id, message, is_active, level, created_at_ms
           FROM system_notifications
           ORDER BY created_at_ms DESC, message ASC`
        )
        .all<NotificationRow>();

      return (rows.results ?? []).map(toRecord);
    },

    async update(id: string, input: UpdateAdminNotificationInput) {
      await db
        .prepare(
          `UPDATE system_notifications
           SET message = ?, is_active = ?, level = ?
           WHERE id = ?`
        )
        .bind(input.message, input.isActive, input.level, id)
        .run();
    },

    async delete(id: string) {
      const result = await db
        .prepare("DELETE FROM system_notifications WHERE id = ?")
        .bind(id)
        .run();
      return changed(result);
    },
  };
}
