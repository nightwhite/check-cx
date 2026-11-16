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
const ERROR_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

class SnapshotPayloadError extends Error {
  constructor() {
    super("snapshot_payload_invalid");
  }
}

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
  try {
    return JSON.parse(row.payload_json) as DashboardSnapshotPayload;
  } catch {
    throw new SnapshotPayloadError();
  }
}

function invalidPeriodResponse() {
  return new Response(
    JSON.stringify({ error: "invalid_period", allowed: VALID_TREND_PERIODS }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...ERROR_HEADERS,
      },
    }
  );
}

function jsonErrorResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...ERROR_HEADERS,
    },
  });
}

async function loadPublicSnapshotOrError(env: Env, period: string) {
  try {
    return await loadDashboardSnapshot(env, period);
  } catch (error) {
    if (error instanceof SnapshotPayloadError) {
      return jsonErrorResponse(500, error.message);
    }
    throw error;
  }
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

type SnapshotChannel = NonNullable<DashboardSnapshotPayload["channels"]>[number];

type ChannelSelection =
  | { ok: true; snapshot: DashboardSnapshotPayload | null; ids: string[] }
  | { ok: false; unknown: string[] };

/** 解析 channels/channel 查询参数：逗号分隔，大小写不敏感，去重保序。 */
function parseChannelFilter(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** 按渠道 id 或名称筛选快照；未知渠道返回 ok=false，便于调用方回报 400。 */
function selectSnapshotChannels(
  snapshot: DashboardSnapshotPayload | null,
  wanted: string[]
): ChannelSelection {
  if (wanted.length === 0) {
    return { ok: true, snapshot, ids: [] };
  }
  const channels = snapshot?.channels ?? [];
  const byKey = new Map<string, SnapshotChannel>();
  for (const channel of channels) {
    byKey.set(channel.id.toLowerCase(), channel);
    byKey.set(channel.name.toLowerCase(), channel);
  }
  const picked: SnapshotChannel[] = [];
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const key of wanted) {
    const channel = byKey.get(key);
    if (!channel) {
      unknown.push(key);
      continue;
    }
    if (!picked.some((item) => item.id === channel.id)) {
      picked.push(channel);
      ids.push(channel.id);
    }
  }
  if (unknown.length > 0) {
    return { ok: false, unknown };
  }
  const nextSnapshot = snapshot ? { ...snapshot, channels: picked } : null;
  return { ok: true, snapshot: nextSnapshot, ids };
}

export const publicRoutes = new Hono<{ Bindings: Env }>()
  .get("/status", async (c) => {
    const period = parseTrendPeriod(c.req.query("period") ?? null);
    if (!period) {
      return invalidPeriodResponse();
    }

    const snapshot = await loadPublicSnapshotOrError(c.env, period);
    if (snapshot instanceof Response) {
      return snapshot;
    }
    const filter = parseChannelFilter(
      c.req.query("channels") ?? c.req.query("channel")
    );
    const selection = selectSnapshotChannels(snapshot, filter);
    if (!selection.ok) {
      return jsonErrorResponse(400, `unknown_channel:${selection.unknown.join(",")}`);
    }
    const payload = buildPublicStatusPayload(selection.snapshot, period);
    const body = JSON.stringify(payload);
    return cachedResponse(
      c.req.raw,
      body,
      body,
      "application/json; charset=utf-8"
    );
  })
  .get("/status-card.png", async (c) => {
    const period = parseTrendPeriod(c.req.query("period") ?? null);
    if (!period) {
      return invalidPeriodResponse();
    }

    const snapshot = await loadPublicSnapshotOrError(c.env, period);
    if (snapshot instanceof Response) {
      return snapshot;
    }
    const filter = parseChannelFilter(
      c.req.query("channels") ?? c.req.query("channel")
    );
    const selection = selectSnapshotChannels(snapshot, filter);
    if (!selection.ok) {
      return jsonErrorResponse(400, `unknown_channel:${selection.unknown.join(",")}`);
    }
    const etagSource = JSON.stringify({
      period,
      generatedAt: snapshot?.generatedAt ?? snapshot?.lastUpdated ?? null,
      channels: selection.ids,
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
      period,
      selection.ids
    );
    return cachedResponse(
      c.req.raw,
      image,
      etagSource,
      "image/png"
    );
  });
