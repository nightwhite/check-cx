import { Hono } from "hono";

import {
  buildPublicStatusPayload,
  type DashboardSnapshotPayload,
} from "./public-status";
import {
  normalizePublicOrigin,
  renderPublicStatusScreenshotPng,
} from "./public-status-screenshot";
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

function jsonErrorResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CACHE_HEADERS,
    },
  });
}

function cachedResponse(
  request: Request,
  body: BodyInit | Uint8Array,
  etagSource: string,
  contentType: string
): Response {
  const etag = generateETag(etagSource);
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        ...CACHE_HEADERS,
      },
    });
  }

  const responseBody = body instanceof Uint8Array ? toArrayBuffer(body) : body;
  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ETag: etag,
      ...CACHE_HEADERS,
    },
  });
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
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
      JSON.stringify(payload),
      "application/json; charset=utf-8"
    );
  })
  .get("/status-card.png", async (c) => {
    const period = parseTrendPeriod(c.req.query("period") ?? null);
    if (!period) {
      return invalidPeriodResponse();
    }

    const snapshot = await loadDashboardSnapshot(c.env, period);
    const etagSource = JSON.stringify({
      period,
      generatedAt: snapshot?.generatedAt ?? snapshot?.lastUpdated ?? null,
    });
    const etag = generateETag(etagSource);
    if (c.req.header("If-None-Match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          ...CACHE_HEADERS,
        },
      });
    }

    const publicOrigin = normalizePublicOrigin(c.env.PUBLIC_ORIGIN);
    if (!publicOrigin) {
      return jsonErrorResponse(503, "public_origin_required");
    }
    if (new URL(c.req.url).origin !== publicOrigin) {
      return jsonErrorResponse(403, "origin_mismatch");
    }

    const image = await renderPublicStatusScreenshotPng(
      c.env.BROWSER,
      publicOrigin,
      period
    );
    return cachedResponse(
      c.req.raw,
      image,
      etagSource,
      "image/png"
    );
  });
