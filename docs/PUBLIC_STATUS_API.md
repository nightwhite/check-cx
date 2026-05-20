# Public Status API

Check CX 提供两个公开只读接口，供其他站点展示当前 AI provider 健康状态。两个接口都只读取 D1 中的 `dashboard_snapshots`，不会触发 provider 检查，也不会返回 endpoint、密钥、请求头或内部日志。

## 状态 JSON

- **Method:** `GET`
- **Path:** `/api/public/status`
- **Query:** `period=7d|15d|30d`，默认 `7d`
- **Response:** `application/json; charset=utf-8`
- **Cache:** `ETag`、`Cache-Control`、`CDN-Cache-Control`
- **CORS:** `Access-Control-Allow-Origin: *`

### 响应示例

```json
{
  "version": 1,
  "generatedAt": "2026-05-20T00:01:00.000Z",
  "period": "7d",
  "overallStatus": "degraded",
  "summary": {
    "total": 2,
    "operational": 1,
    "degraded": 1,
    "failed": 0,
    "maintenance": 0,
    "unknown": 0
  },
  "providers": [
    {
      "id": "cfg-openai",
      "name": "OpenAI GPT-4o",
      "type": "openai",
      "model": "gpt-4o",
      "group": "core",
      "status": "operational",
      "latencyMs": 320,
      "checkedAt": "2026-05-20T00:00:00.000Z",
      "message": "OK",
      "availability": {
        "7d": 100
      }
    }
  ]
}
```

## 状态页截图 PNG

- **Method:** `GET`
- **Path:** `/api/public/status-card.png`
- **Query:** `period=7d|15d|30d`，默认 `7d`
- **Response:** `image/png`
- **Cache:** `ETag`、`Cache-Control`、`CDN-Cache-Control`
- **CORS:** `Access-Control-Allow-Origin: *`

该接口通过 Cloudflare Browser Rendering 打开当前站点首页，并在 Dashboard 数据加载完成后截取整页 PNG。它不是手写 SVG 卡片，也不支持截取任意外部 URL。

### 嵌入示例

```html
<img
  src="https://check-cx.example.com/api/public/status-card.png?period=7d"
  alt="SU8.Codes status"
/>
```

## 状态聚合

整体状态按以下优先级计算：

1. 没有 provider 数据时为 `unknown`。
2. 任一 provider 为 `failed`、`validation_failed` 或 `error` 时为 `failed`。
3. 任一 provider 为 `degraded` 时为 `degraded`。
4. 全部 provider 都为 `maintenance` 时为 `maintenance`。
5. 其他情况为 `operational`。

## 错误响应

`period` 非法时返回 `400`：

```json
{
  "error": "invalid_period",
  "allowed": ["7d", "15d", "30d"]
}
```
