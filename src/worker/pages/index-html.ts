import { parseTrendPeriod, type TrendPeriod } from "../routes/trend-period";

// 首页是静态构建产物；Worker 在返回 HTML 时内联当前快照与站点元信息，
// 让首屏不必再等一次 /api/dashboard 往返，标题、描述与 favicon 也跟随后台配置。

export const INITIAL_DATA_ELEMENT_ID = "dashboard-initial-data";
const DEFAULT_PAGE_PERIOD: TrendPeriod = "30d";

interface SnapshotRow {
  payload_json: string;
}

interface SnapshotSite {
  statusTitle?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
}

interface SnapshotPayload {
  site?: SnapshotSite | null;
  providerTimelines?: unknown;
  [key: string]: unknown;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 内联到 <script type="application/json"> 中，需避免提前闭合标签
function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

/** 去掉前端用不到的 providerTimelines，缩小首页与 API 负载。 */
export function toCompactDashboardPayload(payload: SnapshotPayload): SnapshotPayload {
  const compact = { ...payload };
  delete compact.providerTimelines;
  return compact;
}

export function getPagePeriod(url: URL): TrendPeriod {
  const value = url.searchParams.get("period");
  return (value && parseTrendPeriod(value)) || DEFAULT_PAGE_PERIOD;
}

export function injectDashboardHtml(
  html: string,
  payload: SnapshotPayload | null
): string {
  if (!payload) {
    return html;
  }

  let result = html;
  const site = payload.site;
  const title = site?.statusTitle?.trim();
  if (title) {
    result = result.replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeHtml(title)}</title>`
    );
  }
  const description = site?.description?.trim();
  if (description) {
    result = result.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escapeHtml(description)}">`
    );
  }
  if (site?.faviconUrl) {
    // 按配置地址生成版本号，favicon 可以长缓存，换图后链接随之变化
    result = result.replace(
      /href="\/favicon\.ico\?v=site"/,
      `href="/favicon.ico?v=${hashString(site.faviconUrl)}"`
    );
  }

  const script = `<script type="application/json" id="${INITIAL_DATA_ELEMENT_ID}">${serializeForScript(
    toCompactDashboardPayload(payload)
  )}</script>`;
  return result.includes("</head>")
    ? result.replace("</head>", `${script}</head>`)
    : `${script}${result}`;
}

async function loadSnapshotPayload(
  env: Env,
  period: TrendPeriod
): Promise<SnapshotPayload | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT payload_json
       FROM dashboard_snapshots
       WHERE snapshot_key = ? AND period = ?`
    )
      .bind("dashboard", period)
      .first<SnapshotRow>();
    return row ? (JSON.parse(row.payload_json) as SnapshotPayload) : null;
  } catch {
    // 快照读取失败时退回纯静态页面，由前端自行请求 API
    return null;
  }
}

export async function renderDashboardPage(
  request: Request,
  env: Env,
  assetResponse: Response
): Promise<Response> {
  const contentType = assetResponse.headers.get("Content-Type") ?? "";
  if (
    request.method !== "GET" ||
    !assetResponse.ok ||
    !contentType.includes("text/html")
  ) {
    return assetResponse;
  }

  const url = new URL(request.url);
  // 截图模式需要每次实时拉取，保持静态页面
  if (url.searchParams.get("screenshot") === "1") {
    return assetResponse;
  }

  const payload = await loadSnapshotPayload(env, getPagePeriod(url));
  const html = injectDashboardHtml(await assetResponse.text(), payload);
  const headers = new Headers(assetResponse.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", "no-cache");
  return new Response(html, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}
