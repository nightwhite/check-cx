# Design: Public status and embed image API

## Context

Check CX 已迁移为 Astro 静态页面 + Hono Worker API + D1 + Cron Trigger。Dashboard 数据由 Cron 写入 `dashboard_snapshots`，适合作为公开状态 API 的读取源。图片端点需要反映真实公开页面视觉，而不是单独维护一套手写图片模板。

## Goals

- 为第三方站点提供稳定、脱敏、可缓存的状态 JSON。
- 提供一个基于真实状态页渲染结果的 PNG 图片端点。
- 保持公开 API 不扫描历史表，不触发健康检查。
- 图片截图仅允许当前站点状态页，不能接受任意外部 URL。

## Non-Goals

- 不输出 provider endpoint、密钥、内部错误栈或管理字段。
- 不新增多页面公开状态站。
- 不提供通用 HTML-to-image 服务或任意 URL 截图能力。

## Decisions

### 使用 Browser Rendering 输出 PNG

`/api/public/status-card.png` 使用 Cloudflare Browser Rendering 和 `@cloudflare/puppeteer` 打开当前站点首页，传入 `period` 与 `screenshot=1`，等待 Dashboard 标记为 ready 后截取整页 PNG。这样图片结果与真实公开状态页保持一致，不再维护单独的 SVG 绘制逻辑。

### 限制截图目标

截图 URL 由当前请求 origin 构造，固定为 `/`，只附加 `period` 和 `screenshot=1`。接口不接受外部 URL 参数，避免 SSRF 和任意截图滥用。

### 使用 `dashboard_snapshots` 作为公开 JSON 数据源

公开 JSON API 读取 `snapshot_key = "dashboard"` 和请求的 `period`。如果没有 snapshot，则返回空状态 payload；不会回退扫描 `check_history`，避免请求路径变慢。

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

### 缓存和成本

公开 API 返回 `ETag`、`Cache-Control`、`CDN-Cache-Control`、`Cloudflare-CDN-Cache-Control` 和 `Access-Control-Allow-Origin: *`。`If-None-Match` 命中时返回 `304`。PNG 截图会消耗 Browser Rendering 配额，因此后续如出现高频访问，应优先改为 Cron 或 Admin 生成图片后写入对象存储，再由公开 API 返回缓存图片。
