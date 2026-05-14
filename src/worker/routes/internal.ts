import { Hono, type Context } from "hono";

type InternalContext = Context<{ Bindings: Env }>;

function getInternalMetricsToken(env: Env): string | null {
  const value = env.INTERNAL_METRICS_TOKEN;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isAuthorized(c: InternalContext) {
  const token = getInternalMetricsToken(c.env);
  return Boolean(token) && c.req.header("x-internal-token") === token;
}

export const internalRoutes = new Hono<{ Bindings: Env }>().get(
  "/db-health",
  async (c) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return c.json({ ok: result?.ok === 1 });
  }
).get("/cache-metrics", async (c) => {
  if (!isAuthorized(c)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const snapshots = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM dashboard_snapshots"
  ).first<{ count: number }>();

  return c.json({
    workerRuntime: "cloudflare-workers",
    dashboardSnapshots: {
      count: snapshots?.count ?? 0,
    },
    combinedDbCache: {
      hits: 0,
      misses: 0,
    },
    generatedAt: new Date().toISOString(),
  });
});
