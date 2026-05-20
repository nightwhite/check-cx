# Design: Workers Admin Console

## Context

Check CX 当前生产目标是 Cloudflare Workers。生产入口是 Hono Worker API 与 Astro 静态资源，不再是 Next.js runtime。D1 schema 已包含 admin 需要维护的核心表：`check_request_templates`、`check_models`、`check_configs`、`group_info`、`system_notifications`、`job_locks`、`job_runs`、`dashboard_snapshots` 和 `check_latest`。

参考 admin 项目使用 Next.js 16、Supabase Auth、角色权限、Server Actions 和 Supabase service role。该项目的导航结构、表单字段和业务规则可参考，但运行时和数据访问层必须重写为 Worker-safe 版本。

## Goals

- 在 Workers 项目内提供配置管理能力。
- 只使用 `ADMIN_TOKEN` 完成 admin 登录。
- 保证 provider key 不被 API 或 UI 回显。
- 保持 Worker 请求路径轻量、可测试、无 Node-only runtime 依赖。
- 管理台 UI 保持紧凑、清晰、稳定，适合单页运维配置场景。

## Non-Goals

- 不提供 OAuth、用户表、角色、成员权限或多租户能力。
- 不提供批量操作。
- 不提供页面内编辑 Cron 表达式。
- 不提供请求触发的 provider health check。
- 不引入 HTML 截图、Browser Rendering 或 Puppeteer。
- 不恢复 Supabase/Postgres 依赖。

## Decisions

### Admin 页面路径

页面路径由 `ADMIN_PATH` 控制，本地默认 `/admin`。Hono API 路径固定为 `/api/admin/*`，避免管理页面路径变化影响 API contract。

### Admin 鉴权

`POST /api/admin/session` 校验请求体 token 是否等于 `ADMIN_TOKEN`。校验通过后签发 HttpOnly cookie。cookie 默认 30 天过期，并使用 HMAC-SHA-256 签名，签名 key 派生自 `ADMIN_TOKEN`。

如果 `ADMIN_TOKEN` 未配置，所有 admin session 操作返回不可用状态。实现不得添加匿名模式或开发 fallback。

### 数据访问

Admin API 使用专门 repository 模块读写 D1。列表 API 可使用小范围 join 组装展示字段，但不得扫描 `check_history` 作为主查询路径。运行状态页读取 `job_runs`、`job_locks`、`dashboard_snapshots` 和 `check_latest`。

### Provider key 加密

扩展 `src/worker/crypto/provider-key.ts`，新增 `encryptProviderKey()`。加密使用 Web Crypto AES-GCM，与现有 `decryptProviderKey()` 共用 `CONFIG_ENCRYPTION_KEY` 长度规则。创建配置和替换 key 时写入 `api_key_ciphertext`、`api_key_nonce`、`api_key_version`。读取配置时只返回 `hasApiKey`。

### UI 结构

新增 `src/pages/admin.astro` 作为本地默认 admin shell，React island 放在 `src/components/admin/admin-island.tsx`。Worker `fetch` 根据 `ADMIN_PATH` 为非 `/admin` 的生产路径提供同一静态 shell。

Admin island 使用现有 React、Tailwind、lucide-react 和 shadcn 风格 primitives。必要时补充 `input`、`label`、`textarea`、`select`、`dialog`、`tabs` 等 UI primitive，但不整包复制参考 admin 的 sidebar 与表格。

### Cron 设计

Cron 保持 `wrangler.jsonc` 中的 `*/1 * * * *`。管理台运行状态页只展示该事实和 D1 中的 job 运行记录，不提供编辑。

## Risks / Trade-offs

- `ADMIN_TOKEN` 单 token 模型简单，但不提供用户级审计。该限制符合 v1 单人/小团队维护场景。
- 30 天 cookie 减少频繁登录，但 token 泄露风险更高。缓解方式是 HttpOnly、Secure、SameSite=Lax，且 Cloudflare secret 不进入源码。
- D1 没有 Postgres 复杂约束能力，删除模板或模型前需要 API 层检查引用，避免破坏配置。
- `ADMIN_PATH` 非 `/admin` 时，Astro 静态路由无法自然生成任意路径。Worker `fetch` 需要在资产 404 后对 `ADMIN_PATH` 返回 admin shell。

## Migration Plan

1. 创建 OpenSpec 和 superpowers 计划。
2. 添加 admin auth route tests，并实现 session cookie。
3. 添加 admin repositories 与 route contract tests。
4. 实现 provider key 加密写入能力。
5. 实现 admin Astro shell 与 React island。
6. 添加 runtime 状态页和验证文档。
7. 运行完整验证命令后提交。

## Open Questions

- 无阻塞开放问题。当前 v1 范围按用户确认执行：30 天 session、无批量、`ADMIN_TOKEN`、`ADMIN_PATH`、固定 `/api/admin/*`、Cron 只读。
