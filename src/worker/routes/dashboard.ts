import { Hono } from "hono";

import { parseTrendPeriod, VALID_TREND_PERIODS } from "./trend-period";

interface SnapshotRow {
  payload_json: string;
  etag: string;
  generated_at_ms: number;
}

function generateETag(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

function emptyDashboard(period: string) {
  return {
    providerTimelines: [],
    groupInfos: [],
    lastUpdated: null,
    total: 0,
    pollIntervalLabel: "60 秒",
    pollIntervalMs: 60_000,
    availabilityStats: {},
    trendPeriod: period,
    generatedAt: 0,
  };
}

export const dashboardRoutes = new Hono<{ Bindings: Env }>().get("/", async (c) => {
  const period = parseTrendPeriod(c.req.query("trendPeriod") ?? null);
  if (!period) {
    return c.json(
      { error: "invalid_trend_period", allowed: VALID_TREND_PERIODS },
      400
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT payload_json, etag, generated_at_ms
     FROM dashboard_snapshots
     WHERE snapshot_key = ? AND period = ?`
  )
    .bind("dashboard", period)
    .first<SnapshotRow>();

  if (!row) {
    const payloadJson = JSON.stringify(emptyDashboard(period));
    const etag = generateETag(payloadJson);
    if (c.req.header("If-None-Match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    return new Response(payloadJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, no-cache",
        ETag: etag,
      },
    });
  }

  if (c.req.header("If-None-Match") === row.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: row.etag },
    });
  }

  return new Response(row.payload_json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, no-cache",
      "CDN-Cache-Control": "max-age=60",
      "Cloudflare-CDN-Cache-Control": "max-age=60, stale-while-revalidate=300",
      ETag: row.etag,
      Vary: "Accept-Encoding",
    },
  });
});
