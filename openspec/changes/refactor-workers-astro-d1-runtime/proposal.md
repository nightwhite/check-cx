# Change: Refactor runtime to Cloudflare Workers Astro D1

## Why

当前 Next.js + Supabase 运行时不适合直接部署到 Cloudflare Workers。项目的健康检查依赖常驻轮询、Next.js API routes、Supabase/PostgreSQL RPC 和内存缓存，这些能力需要迁移为 Workers、D1 和 Cron Trigger 的运行模型。

## What Changes

- 用 Astro 静态单页替换 Next.js App Router 页面层。
- 用 Hono Worker API 替换 Next.js API routes。
- 用 D1 + Drizzle 替换 Supabase/PostgreSQL。
- 用 Cron Trigger 替换 `setInterval` 轮询。
- 保留 Dashboard、分组、通知、状态 API、provider health checks。
- 把原分组页面能力折叠进单页 Dashboard 的筛选、query 和详情面板。
- **BREAKING**: 数据库从 Supabase schema 迁移为 D1 schema，部署入口从 Next.js runtime 迁移为 Cloudflare Worker。

## Impact

- Affected specs: dashboard, status-api, health-check-runtime, data-storage
- Affected code: app, components, lib/core, lib/database, lib/providers, wrangler config
- Affected operations: deployment, database migration, secrets management, Cron monitoring
