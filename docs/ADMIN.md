# Check CX Workers Admin

Workers 版本内置轻量管理台，用于维护 Provider 配置、模型、请求模板、分组、通知，并查看 Cron 运行状态。

## 本地入口

本地默认入口：

```text
http://127.0.0.1:8787/admin
```

页面路径由 `ADMIN_PATH` 控制。本地默认值为 `/admin`，可以通过环境变量改成其他路径。

Admin API 固定为：

```text
/api/admin/*
```

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `ADMIN_PATH` | 否 | 管理台页面路径，本地默认 `/admin`。 |
| `ADMIN_TOKEN` | 是 | 管理台登录 token。登录 session 默认 30 天。 |
| `CONFIG_ENCRYPTION_KEY` | 是 | Provider key 加密密钥，必须是 16、24 或 32 字节。 |

本地开发默认读取仓库根目录的 `.env`。可以从示例文件复制：

```bash
cp .env.example .env
```

`.env` 示例：

```env
ADMIN_PATH=/admin
ADMIN_TOKEN=replace-with-a-long-random-token
CONFIG_ENCRYPTION_KEY=replace-with-16-24-or-32-byte-key
```

`.env` 已被 `.gitignore` 忽略，可以放本地真实 token。`.env.example` 只能保留占位值。

## Cloudflare Secret

`ADMIN_TOKEN` 和 `CONFIG_ENCRYPTION_KEY` 必须通过 Wrangler secret 注入，不要写入 `wrangler.jsonc` 或提交到仓库。

```bash
wrangler secret put ADMIN_TOKEN
wrangler secret put CONFIG_ENCRYPTION_KEY
```

`ADMIN_PATH` 不是 secret，可以写在 `wrangler.jsonc` 的 `vars` 中。

## 登录防爆破与人机验证

登录接口内置防爆破，无需配置：

- 同一 IP（`CF-Connecting-IP`）15 分钟内失败 5 次锁定 15 分钟，重复锁定时长翻倍，最长 24 小时；24 小时无尝试后重置。
- 全站 60 秒内失败达到 30 次时，所有登录暂停 60 秒。
- 锁定期间返回 `429` 与 `Retry-After`，登录页显示倒计时。

Cloudflare Turnstile 人机验证通过环境变量开启，**未配置时默认不开启**：

| 变量 | 说明 | 注入方式 |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | 公开的 Site Key，前端渲染验证组件使用 | `wrangler.jsonc` 的 `vars` 或 `wrangler secret put` |
| `TURNSTILE_SECRET_KEY` | 服务端校验使用，不能泄露 | `wrangler secret put TURNSTILE_SECRET_KEY` |

两个变量都配置时才启用；只配置其中一个等同于未配置。获取方式：Cloudflare 控制台 → Turnstile → Add widget，填写管理台所在域名，模式选 Managed。

```bash
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

关闭人机验证只需删除这两个变量（`wrangler secret delete TURNSTILE_SECRET_KEY`）。

## 登录与 Session

访问 `ADMIN_PATH` 后输入 `ADMIN_TOKEN` 登录。登录成功后，Worker 会设置 `HttpOnly` session cookie：

```text
check_cx_admin_session
```

session 有效期为 30 天。`ADMIN_TOKEN` 未配置时，管理台会显示不可用状态，Admin API 返回 503。

## Provider Key

管理台支持创建 Provider 配置和替换 Provider key。

- 列表只显示 `已配置` 或 `未配置`。
- 替换 key 时只填写新 key。
- Admin API 不返回明文 key、ciphertext 或 nonce。
- 写入 D1 前会用 Worker Web Crypto 加密。

## Cron

Cron 默认每分钟执行一次：

```text
*/1 * * * *
```

管理台只读展示 Cron、最近 `job_runs`、当前 `job_locks`、最近 dashboard snapshot 和最近检查时间，不提供 Cron 编辑入口。调整 Cron 需要修改 `wrangler.jsonc` 后重新部署。

## 本地测试

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm dev
```

打开：

```text
http://127.0.0.1:8787/admin
```

检查：

- 未登录状态可输入 token。
- 登录后概览可见。
- Provider 配置列表不显示明文 key。
- 替换 key dialog 不预填旧 key。
- 运行状态页显示 `每 1 分钟`，没有 Cron 编辑控件。
