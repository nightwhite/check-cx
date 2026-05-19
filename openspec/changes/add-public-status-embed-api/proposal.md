# Change: Add public status and embed image API

## Why

其他站点需要低成本展示 Check CX 的整体状态，但现有 API 更偏 Dashboard 内部使用，字段较多且不适合作为公开嵌入契约。用户也需要一个可直接作为图片嵌入的状态卡片，避免第三方站点自己实现状态渲染。

## What Changes

- 新增公开状态 JSON API：`GET /api/public/status`。
- 新增公开状态卡片 SVG API：`GET /api/public/status-card.svg`。
- 两个公开 API 都只读取 `dashboard_snapshots`，不得触发 provider health check。
- 公开 JSON 输出经过脱敏的整体状态、统计、更新时间和 provider 摘要。
- SVG 输出可通过 `<img>` 嵌入，包含整体状态、统计、更新时间和少量 provider 状态。
- 公开 API 支持 `period=7d|15d|30d`，并提供 CORS、ETag 和缓存头。

## Impact

- Affected specs: public-status-api, dashboard
- Affected code: `src/worker/app.ts`, `src/worker/routes/public.ts`, worker route tests
- Affected operations: third-party status embed integration and CDN caching behavior
