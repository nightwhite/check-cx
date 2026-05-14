import { Hono } from "hono";

interface NotificationRow {
  id: string;
  message: string;
  is_active: number;
  level: "info" | "warning" | "error";
  created_at_ms: number;
}

export const notificationRoutes = new Hono<{ Bindings: Env }>().get(
  "/",
  async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT id, message, is_active, level, created_at_ms
       FROM system_notifications
       WHERE is_active = 1
       ORDER BY created_at_ms DESC`
    ).all<NotificationRow>();

    return c.json(
      result.results.map((row) => ({
        id: row.id,
        message: row.message,
        is_active: Boolean(row.is_active),
        level: row.level,
        created_at: new Date(row.created_at_ms).toISOString(),
      })),
      200,
      {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      }
    );
  }
);
