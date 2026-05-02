import { Hono } from "hono";

import { parseTrendPeriod, VALID_TREND_PERIODS } from "./trend-period";

interface SnapshotRow {
  payload_json: string;
  etag: string;
}

function parseGroupName(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export const groupRoutes = new Hono<{ Bindings: Env }>().get(
  "/:groupName",
  async (c) => {
    const period = parseTrendPeriod(c.req.query("trendPeriod") ?? null);
    if (!period) {
      return c.json(
        { error: "invalid_trend_period", allowed: VALID_TREND_PERIODS },
        400
      );
    }

    const groupName = parseGroupName(c.req.param("groupName"));
    if (!groupName) {
      return c.json({ error: "invalid_group_name" }, 400);
    }

    const row = await c.env.DB.prepare(
      `SELECT payload_json, etag
       FROM dashboard_snapshots
       WHERE snapshot_key = ? AND period = ?`
    )
      .bind(`group:${groupName}`, period)
      .first<SnapshotRow>();

    if (!row) {
      return c.json({ error: "分组不存在或没有配置" }, 404);
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
        "Cloudflare-CDN-Cache-Control":
          "max-age=60, stale-while-revalidate=300",
        ETag: row.etag,
        Vary: "Accept-Encoding",
      },
    });
  }
);
