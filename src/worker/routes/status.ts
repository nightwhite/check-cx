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

export const statusRoutes = new Hono<{ Bindings: Env }>().get("/", async (c) => {
  const groupFilter = c.req.query("group") ?? null;
  const modelFilter = c.req.query("model") ?? null;
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
     LEFT JOIN check_models m ON m.id = c.model_id
     LEFT JOIN check_latest l ON l.config_id = c.id
     WHERE c.enabled = 1`
  ).all<ProviderStatusRow>();

  const providers = result.results
    .filter((row) => !groupFilter || row.group_name === groupFilter)
    .filter((row) => !modelFilter || row.model === modelFilter)
    .map((row) => {
      const status = row.is_maintenance ? "maintenance" : row.status;
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        model: row.model,
        group: row.group_name,
        endpoint: row.endpoint,
        latest: status
          ? {
              status,
              latencyMs: row.latency_ms,
              pingLatencyMs: row.ping_latency_ms,
              checkedAt: row.checked_at_ms
                ? new Date(row.checked_at_ms).toISOString()
                : generatedAt,
              message: row.message ?? "",
            }
          : null,
        timeline: [],
      };
    });

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
      avgLatencyMs: null,
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
