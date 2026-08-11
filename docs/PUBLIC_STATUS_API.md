# Public Status API

Check CX exposes public read-only endpoints for embedding the current AI channel and model status in other sites. Both endpoints read the same `dashboard_snapshots` payload used by the homepage. They do not trigger provider checks and do not expose API keys, request headers, raw endpoints, or internal logs.

## Status JSON

- **Method:** `GET`
- **Path:** `/api/public/status`
- **Query:** `period=7d|15d|30d`, default `7d`
- **Response:** `application/json; charset=utf-8`
- **Version:** `2`
- **Cache:** `ETag`, `Cache-Control`, `CDN-Cache-Control`
- **CORS:** `Access-Control-Allow-Origin: *`

### Response Shape

```json
{
  "version": 2,
  "generatedAt": "2026-05-20T00:01:00.000Z",
  "period": "7d",
  "overallStatus": "degraded",
  "site": {
    "siteName": "AI Status",
    "statusTitle": "AI Channel Status",
    "description": "Production AI status",
    "logoUrl": "https://example.com/logo.png",
    "publicOrigin": "https://status.example.com"
  },
  "summary": {
    "total": 2,
    "operational": 1,
    "degraded": 1,
    "failed": 0,
    "maintenance": 0,
    "unknown": 0
  },
  "channels": [
    {
      "id": "channel-openai",
      "name": "OpenAI Official",
      "logoUrl": null,
      "websiteUrl": "https://openai.com/",
      "statusPageUrl": "https://status.openai.com/",
      "models": [
        {
          "id": "cfg-openai",
          "name": "OpenAI GPT-4o",
          "type": "openai",
          "model": "gpt-4o",
          "status": "operational",
          "latencyMs": 320,
          "checkedAt": "2026-05-20T00:00:00.000Z",
          "message": "OK",
          "availability": {
            "7d": 100,
            "15d": 95
          },
          "history": [
            {
              "status": "operational",
              "latencyMs": 320,
              "checkedAt": "2026-05-20T00:00:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

### Status Values

`overallStatus` and model `status` use the public status vocabulary:

- `operational`
- `degraded`
- `failed`
- `maintenance`
- `unknown`

Internal statuses `validation_failed` and `error` are reported as `failed` in the public API.

## Screenshot PNG

- **Method:** `GET`
- **Path:** `/api/public/status-card.png`
- **Query:** `period=7d|15d|30d`, default `7d`
- **Response:** `image/png`
- **Cache:** `ETag`, `Cache-Control`, `CDN-Cache-Control`
- **CORS:** `Access-Control-Allow-Origin: *`
- **Required config:** `PUBLIC_ORIGIN`, for example `https://check-cx.example.com`

The screenshot endpoint opens the real homepage with `?period=...&screenshot=1`, waits for `[data-dashboard-ready='true']`, and captures the rendered page. It intentionally reuses the homepage UI so the homepage, JSON API, and PNG endpoint express the same `site -> channels -> models -> history` semantics.

Requests must match `PUBLIC_ORIGIN`; mismatched origins return `403 origin_mismatch`. Missing or invalid `PUBLIC_ORIGIN` returns `503 public_origin_required`.

### Local Screenshot Test

Set `.env` so the origin matches the local URL:

```env
PUBLIC_ORIGIN=http://127.0.0.1:8787
```

Run locally:

```bash
pnpm dev
curl -I "http://127.0.0.1:8787/api/public/status-card.png?period=7d"
```

If Wrangler repeatedly downloads Chrome for Testing or Browser Rendering fails locally, inspect the Wrangler log for the browser cache path, verify the browser binary, and restart `pnpm dev`. If network proxy is required:

```bash
HTTPS_PROXY=http://127.0.0.1:7890 \
HTTP_PROXY=http://127.0.0.1:7890 \
ALL_PROXY=socks5://127.0.0.1:7890 \
pnpm dev
```

### Embed Example

```html
<img
  src="https://check-cx.example.com/api/public/status-card.png?period=7d"
  alt="AI model status"
/>
```

## Overall Status Rules

Overall status is calculated from all public models:

1. No model data returns `unknown`.
2. Any `failed` model returns `failed`.
3. Any `degraded` model returns `degraded`.
4. All models in `maintenance` returns `maintenance`.
5. Any `unknown` model returns `unknown`.
6. Otherwise returns `operational`.

## Error Response

Invalid `period` returns `400`:

```json
{
  "error": "invalid_period",
  "allowed": ["7d", "15d", "30d"]
}
```

## Notification Configuration

Feishu/Lark Webhook notification settings are configured in the admin console and stored encrypted in D1. Do not put the Webhook URL in `.env` or `wrangler.jsonc`.
