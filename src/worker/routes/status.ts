import { Hono } from "hono";

interface ProviderStatusRow {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  group_name: string | null;
  is_maintenance: number;
  model: string | null;
  status: string | null;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at_ms: number | null;
  message: string | null;
}

interface StatusTimelineItem {
  status: string;
  latencyMs: number | null;
  pingLatencyMs: number | null;
  checkedAt: string;
  message: string;
}

function computeStatistics(items: StatusTimelineItem[]) {
  const latencies = items
    .map((item) => item.latencyMs)
    .filter((latency): latency is number => latency !== null);
  const operationalCount = items.filter(
    (item) => item.status === "operational"
  ).length;
  const degradedCount = items.filter((item) => item.status === "degraded").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const validationFailedCount = items.filter(
    (item) => item.status === "validation_failed"
  ).length;
  const successCount = operationalCount + degradedCount;

  return {
    totalChecks: items.length,
    operationalCount,
    degradedCount,
    failedCount,
    validationFailedCount,
    successRate:
      items.length > 0 ? Math.round((successCount / items.length) * 10_000) / 100 : 0,
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length)
        : null,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : null,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
  };
}

export const statusRoutes = new Hono<{ Bindings: Env }>().get("/", async (c) => {
  const groupFilter = c.req.query("group") || null;
  const modelFilter = c.req.query("model") || null;
  const generatedAt = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `SELECT
       c.id,
       c.name,
       c.type,
       c.endpoint,
       c.group_name,
       c.is_maintenance,
       m.model,
       l.status,
       l.latency_ms,
       l.ping_latency_ms,
       l.checked_at_ms,
       l.message
     FROM check_configs c
     JOIN check_models m ON m.id = c.model_id
     LEFT JOIN check_latest l ON l.config_id = c.id
     WHERE c.enabled = 1
       AND (?1 IS NULL OR c.group_name = ?1)
       AND (?2 IS NULL OR m.model = ?2)`
  )
    .bind(groupFilter, modelFilter)
    .all<ProviderStatusRow>();

  const providers = (result.results ?? [])
    .map((row) => {
      const status = row.is_maintenance ? "maintenance" : row.status;
      const checkedAt = row.checked_at_ms
        ? new Date(row.checked_at_ms).toISOString()
        : generatedAt;
      const latest = status
        ? {
            status,
            latencyMs: row.latency_ms,
            pingLatencyMs: row.ping_latency_ms,
            checkedAt,
            message: row.message ?? "",
          }
        : null;
      const timeline = latest ? [latest] : [];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        model: row.model,
        group: row.group_name,
        endpoint: row.endpoint,
        latest,
        statistics: computeStatistics(timeline),
        timeline,
      };
    });
  const latencyValues = providers
    .map((provider) => provider.latest?.latencyMs ?? null)
    .filter((latency): latency is number => latency !== null);

  return c.json({
    providers,
    summary: {
      total: providers.length,
      operational: providers.filter(
        (provider) => provider.latest?.status === "operational"
      ).length,
      degraded: providers.filter((provider) => provider.latest?.status === "degraded")
        .length,
      failed: providers.filter((provider) => provider.latest?.status === "failed")
        .length,
      validationFailed: providers.filter(
        (provider) => provider.latest?.status === "validation_failed"
      ).length,
      maintenance: providers.filter(
        (provider) => provider.latest?.status === "maintenance"
      ).length,
      avgLatencyMs:
        latencyValues.length > 0
          ? Math.round(
              latencyValues.reduce((sum, latency) => sum + latency, 0) /
                latencyValues.length
            )
          : null,
    },
    metadata: {
      generatedAt,
      pollIntervalMs: 60_000,
      pollIntervalLabel: "60 秒",
      filters: {
        group: groupFilter,
        model: modelFilter,
      },
    },
  });
});
