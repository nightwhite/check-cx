# Change: Add Workers Admin Console

## Why

当前 Workers/Astro/D1 版本缺少管理入口，配置、模型、模板、分组和通知仍需要通过迁移脚本或直接操作数据库维护。参考 admin 项目提供了有价值的信息架构，但它依赖 Next.js、Supabase Auth、Supabase service role 和 Server Actions，不能直接用于 Cloudflare Workers 最佳实践架构。

## What Changes

- 新增 Astro + React island 管理台页面，页面路径由 `ADMIN_PATH` 指定，本地默认 `/admin`。
- 新增固定路径 Hono Admin API：`/api/admin/*`。
- 使用 `ADMIN_TOKEN` 环境变量进行登录，登录 session 默认有效期为 30 天。
- 使用 HttpOnly cookie 保存 admin session。
- 提供模板、模型、Provider 配置、分组和通知的单条 CRUD。
- Provider API key 只允许创建或替换，不允许读取明文。
- 提供 Cron/job/runtime 只读状态页，Cron 默认每分钟一次。
- 不迁移原版用户系统、角色权限和批量操作。

## Impact

- Affected specs: admin-console, data-storage, health-check-runtime
- Affected code: `src/worker/app.ts`, `src/worker/index.ts`, `src/worker/routes/admin`, `src/worker/db/repositories`, `src/worker/crypto/provider-key.ts`, `src/pages`, `src/components/admin`, `src/components/ui`, tests
- Affected operations: Cloudflare secrets need `ADMIN_TOKEN`; local development can use `ADMIN_PATH=/admin`
