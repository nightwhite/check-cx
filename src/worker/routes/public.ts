import { Hono } from "hono";

import {
  buildPublicStatusPayload,
  type DashboardSnapshotPayload,
} from "./public-status";
import { renderPublicStatusCardSvg } from "./public-status-card";
import { parseTrendPeriod, VALID_TREND_PERIODS } from "./trend-period";

interface SnapshotRow {
  payload_json: string;
}

const CACHE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=60",
  "Cloudflare-CDN-Cache-Control": "max-age=60, stale-while-revalidate=300",
  Vary: "Accept-Encoding",
};

function generateETag(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

async function loadDashboardSnapshot(
  env: Env,
  period: string
): Promise<DashboardSnapshotPayload | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json
     FROM dashboard_snapshots
     WHERE snapshot_key = ? AND period = ?`
  )
    .bind("dashboard", period)
    .first<SnapshotRow>();

  if (!row) {
    return null;
  }
  return JSON.parse(row.payload_json) as DashboardSnapshotPayload;
}

function invalidPeriodResponse() {
  return new Response(
    JSON.stringify({ error: "invalid_period", allowed: VALID_TREND_PERIODS }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...CACHE_HEADERS,
      },
    }
  );
}

function cachedResponse(
  request: Request,
  body: string,
  contentType: string
): Response {
  const etag = generateETag(body);
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        ...CACHE_HEADERS,
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ETag: etag,
      ...CACHE_HEADERS,
    },
  });
}

export const publicRoutes = new Hono<{ Bindings: Env }>()
  .get("/status", async (c) => {
    const period = parseTrendPeriod(c.req.query("period") ?? null);
    if (!period) {
      return invalidPeriodResponse();
    }

    const snapshot = await loadDashboardSnapshot(c.env, period);
    const payload = buildPublicStatusPayload(snapshot, period);
    return cachedResponse(
      c.req.raw,
      JSON.stringify(payload),
      "application/json; charset=utf-8"
    );
  })
  .get("/status-card.svg", async (c) => {
    const period = parseTrendPeriod(c.req.query("period") ?? null);
    if (!period) {
      return invalidPeriodResponse();
    }

    const snapshot = await loadDashboardSnapshot(c.env, period);
    const payload = buildPublicStatusPayload(snapshot, period);
    return cachedResponse(
      c.req.raw,
      renderPublicStatusCardSvg(payload),
      "image/svg+xml; charset=utf-8"
    );
  });
