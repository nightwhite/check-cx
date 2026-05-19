# Design: Public status and embed image API

## Context

Check CX 已迁移为 Astro 静态页面 + Hono Worker API + D1 + Cron Trigger。Dashboard 数据由 Cron 写入 `dashboard_snapshots`，适合作为公开状态 API 的读取源。

## Goals

- 为第三方站点提供稳定、脱敏、可缓存的状态 JSON。
- 提供一个无需浏览器渲染服务即可嵌入的图片端点。
- 保持 Workers 请求路径轻量，不扫描历史表，不触发健康检查。

## Non-Goals

- 不引入 Cloudflare Browser Rendering、Puppeteer 或 HTML 截图服务。
- 不输出 provider endpoint、密钥、内部错误栈或管理字段。
- 不新增管理后台或多页面公开状态站。

## Decisions

### 使用 SVG 作为图片输出

`/api/public/status-card.svg` 返回 Worker 原生生成的 SVG。它可被 `<img>`、Markdown 和多数状态页直接使用，且不需要浏览器实例、队列或对象存储。

### 使用 `dashboard_snapshots` 作为唯一数据源

公开 API 读取 `snapshot_key = "dashboard"` 和请求的 `period`。如果没有 snapshot，则返回空状态 payload；不会回退扫描 `check_history`，避免请求路径变慢。

### 公开字段脱敏

公开 JSON 仅包含：

- `version`
- `generatedAt`
- `period`
- `overallStatus`
- `summary`
- `providers`

provider 条目只包含展示必要字段：`id`、`name`、`type`、`model`、`group`、`status`、`latencyMs`、`checkedAt`、`message`、`availability`。

### 状态聚合

整体状态按严重度计算：

1. provider 数量为 0 时为 `unknown`。
2. 任一 provider 为 `failed` 或 `validation_failed` 时为 `failed`。
3. 任一 provider 为 `degraded` 时为 `degraded`。
4. 所有 provider 都为 `maintenance` 时为 `maintenance`。
5. 其他情况为 `operational`。

### 缓存

公开 API 返回 `ETag`、`Cache-Control`、`CDN-Cache-Control`、`Cloudflare-CDN-Cache-Control` 和 `Access-Control-Allow-Origin: *`。`If-None-Match` 命中时返回 `304`。
