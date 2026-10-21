import { Hono } from "hono";

import { createAdminLogRepository } from "../../db/repositories/admin";
import type { AdminLogStatus } from "../../db/repositories/admin";

const LOG_STATUSES = new Set<string>([
  "operational",
  "degraded",
  "failed",
  "validation_failed",
  "maintenance",
  "error",
]);

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const adminLogRoutes = new Hono<{ Bindings: Env }>().get("/", async (c) => {
  const status = c.req.query("status")?.trim() || null;
  if (status && !LOG_STATUSES.has(status)) {
    return c.json({ error: "invalid_status" }, 400);
  }

  const result = await createAdminLogRepository(c.env.DB).list({
    limit: parseInteger(c.req.query("limit"), 100),
    offset: parseInteger(c.req.query("offset"), 0),
    status: status as AdminLogStatus | null,
    channelId: c.req.query("channelId")?.trim() || null,
    q: c.req.query("q")?.trim().slice(0, 200) || null,
  });

  return c.json(result);
});
