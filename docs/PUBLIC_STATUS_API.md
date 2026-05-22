# Public Status API

Check CX 提供两个公开只读接口，供其他站点展示当前 AI provider 健康状态。两个接口都只读取 D1 中的 `dashboard_snapshots`，不会触发 provider 检查，也不会返回 endpoint、密钥、请求头或内部日志。

## 状态 JSON

- **Method:** `GET`
- **Path:** `/api/public/status`
- **Query:** `period=7d|15d|30d`，默认 `7d`
- **Response:** `application/json; charset=utf-8`
- **Cache:** `ETag`、`Cache-Control`、`CDN-Cache-Control`
- **CORS:** `Access-Control-Allow-Origin: *`

`providers[].group` 是按 provider `type` 映射得到的展示分组，例如 `openai` 对应 `OpenAI`、`anthropic` 对应 `Claude`；它不是数据库里的配置业务分组名称。

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
      "group": "OpenAI",
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
- **配置:** 必须设置 `PUBLIC_ORIGIN` 为公开访问源，例如 `https://check-cx.example.com`

该接口通过 Cloudflare Browser Rendering 打开当前站点首页，并在 Dashboard 数据加载完成后截取整页 PNG。它不是手写 SVG 卡片，也不支持截取任意外部 URL。
请求来源必须与 `PUBLIC_ORIGIN` 匹配，否则返回 `403 origin_mismatch`；未配置或配置非法时返回 `503 public_origin_required`。

### 本地截图测试

本项目的 `pnpm dev` 会通过 `wrangler dev --env-file .env` 显式读取
`.env`。本地测试时，`.env` 中的 `PUBLIC_ORIGIN` 必须和访问地址完全一致。例如：

```env
PUBLIC_ORIGIN=http://127.0.0.1:8787
```

启动后用同一个 origin 访问：

```bash
pnpm dev
curl -I "http://127.0.0.1:8787/api/public/status-card.png?period=7d"
```

如果 Wrangler 反复下载浏览器，或本地 Browser Rendering 启动失败，通常是
Wrangler 的 Chrome for Testing 缓存损坏。先从 Wrangler 日志确认正在使用的
Chrome for Testing 缓存目录，再验证缓存里的浏览器二进制。

macOS 上可用类似命令定位浏览器；其他系统需要替换为对应的 Wrangler 缓存目录：

```bash
find "$HOME/Library/Caches/.wrangler/chrome" \
  -path "*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  -print -quit
```

然后用输出路径执行 `--version`，确认浏览器二进制能正常启动。
若出现 `segment '__LINKEDIT' load command content extends beyond end of file`
等二进制损坏错误，删除对应版本缓存后重新启动 `pnpm dev`，让 Wrangler
重新下载。需要代理时，按本机代理地址设置环境变量，例如：

```bash
HTTPS_PROXY=http://127.0.0.1:7890 \
HTTP_PROXY=http://127.0.0.1:7890 \
ALL_PROXY=socks5://127.0.0.1:7890 \
pnpm dev
```

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
