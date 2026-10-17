import { Hono } from "hono";

import { toCompactDashboardPayload } from "../pages/index-html";
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

function emptyDashboard(period: string, generatedAt = Date.now()) {
  return {
    providerTimelines: [],
    groupInfos: [],
    lastUpdated: null,
    total: 0,
    pollIntervalLabel: "60 秒",
    pollIntervalMs: 60_000,
    availabilityStats: {},
    trendPeriod: period,
    generatedAt,
  };
}

function generateDashboardETag(payload: ReturnType<typeof emptyDashboard>): string {
  const { generatedAt, ...etagPayload } = payload;
  void generatedAt;
  return generateETag(JSON.stringify(etagPayload));
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
    const payload = emptyDashboard(period);
    const payloadJson = JSON.stringify(payload);
    const etag = generateDashboardETag(payload);
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

  // compact=1 去掉首页用不到的 providerTimelines；完整格式保留给外部调用方
  const compact = c.req.query("compact") === "1";
  const etag = compact ? `"${row.etag.replace(/"/g, "")}-c"` : row.etag;
  if (c.req.header("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  const body = compact
    ? JSON.stringify(toCompactDashboardPayload(JSON.parse(row.payload_json)))
    : row.payload_json;
  // 快照每分钟更新一次，边缘只短暂缓存，避免「下次检查」到点后仍拿到旧数据
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, no-cache",
      "CDN-Cache-Control": "max-age=5",
      "Cloudflare-CDN-Cache-Control": "max-age=5",
      ETag: etag,
      Vary: "Accept-Encoding",
    },
  });
});
