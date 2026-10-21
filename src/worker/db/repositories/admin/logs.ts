import type {
  AdminD1Executor,
  AdminLogRecord,
  AdminLogStatus,
  AdminLogsQuery,
  AdminLogsResult,
  AdminProviderType,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface AdminLogRow {
  id: string;
  config_id: string;
  name: string;
  type: AdminProviderType;
  channel_id: string | null;
  channel_name: string | null;
  model: string;
  status: AdminLogStatus;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at_ms: number;
  message: string | null;
  log_message: string | null;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function buildFilters(query: AdminLogsQuery) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status) {
    conditions.push("h.status = ?");
    params.push(query.status);
  }
  if (query.channelId) {
    conditions.push("c.channel_id = ?");
    params.push(query.channelId);
  }

  const keyword = query.q?.trim();
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push(
      `(c.name LIKE ? OR m.model LIKE ? OR COALESCE(h.message, '') LIKE ? OR COALESCE(h.log_message, '') LIKE ?)`
    );
    params.push(like, like, like, like);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function toLogRecord(row: AdminLogRow): AdminLogRecord {
  return {
    id: row.id,
    configId: row.config_id,
    name: row.name,
    type: row.type,
    channelId: row.channel_id,
    channelName: row.channel_name,
    model: row.model,
    status: row.status,
    latencyMs: row.latency_ms,
    pingLatencyMs: row.ping_latency_ms,
    checkedAtMs: row.checked_at_ms,
    message: row.message,
    logMessage: row.log_message,
  };
}

export function createAdminLogRepository(db: AdminD1Executor) {
  return {
    async list(query: AdminLogsQuery): Promise<AdminLogsResult> {
      const limit = normalizeLimit(query.limit);
      const offset = normalizeOffset(query.offset);
      const { where, params } = buildFilters(query);
      const from = `FROM check_history h
        JOIN check_configs c ON c.id = h.config_id
        JOIN check_models m ON m.id = c.model_id
        LEFT JOIN channels ch ON ch.id = c.channel_id`;

      const [countRow, rows] = await Promise.all([
        db
          .prepare(`SELECT COUNT(*) AS count ${from} ${where}`)
          .bind(...params)
          .first<{ count: number }>(),
        db
          .prepare(
            `SELECT h.id, h.config_id, c.name, c.type, c.channel_id,
                    ch.name AS channel_name, m.model, h.status, h.latency_ms,
                    h.ping_latency_ms, h.checked_at_ms, h.message, h.log_message
             ${from} ${where}
             ORDER BY h.checked_at_ms DESC
             LIMIT ? OFFSET ?`
          )
          .bind(...params, limit, offset)
          .all<AdminLogRow>(),
      ]);

      return {
        logs: (rows.results ?? []).map(toLogRecord),
        total: countRow?.count ?? 0,
        limit,
        offset,
      };
    },
  };
}
