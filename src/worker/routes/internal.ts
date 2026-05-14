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

const emptyCacheMetrics = {
  hits: 0,
  misses: 0,
};

async function buildCacheMetrics(c: InternalContext) {
  const snapshots = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM dashboard_snapshots"
  ).first<{ count: number }>();

  return {
    workerRuntime: "cloudflare-workers",
    availabilityCache: emptyCacheMetrics,
    configCache: emptyCacheMetrics,
    groupInfoCache: emptyCacheMetrics,
    dashboardCache: emptyCacheMetrics,
    dashboardSnapshots: {
      count: snapshots?.count ?? 0,
    },
    combinedDbCache: emptyCacheMetrics,
    generatedAt: new Date().toISOString(),
  };
}

export const internalRoutes = new Hono<{ Bindings: Env }>()
  .get("/db-health", async (c) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return c.json({ ok: result?.ok === 1 });
  })
  .get("/cache-metrics", async (c) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json(await buildCacheMetrics(c));
  })
  .post("/cache-metrics", async (c) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      ok: true,
      reset: false,
      ...(await buildCacheMetrics(c)),
    });
  });
