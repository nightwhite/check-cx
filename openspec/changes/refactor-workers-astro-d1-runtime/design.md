## Context

Check CX 是 AI Provider 和模型健康状态面板。当前实现用 Next.js App Router 渲染页面和 API，用 Supabase/PostgreSQL 保存配置与历史，用进程内轮询器持续执行检查。

Cloudflare Workers 不提供长驻 Node 进程模型，D1 也不是 PostgreSQL。迁移必须同时调整页面、API、调度和数据模型，而不是把现有代码直接搬进 Worker。

## Goals / Non-Goals

Goals:

- 生产入口迁移到 Cloudflare Worker。
- 前端变为 Astro 静态单页，React islands 只承载 Dashboard 交互。
- 后端 API 使用 Hono。
- 数据层使用 D1 + Drizzle。
- 健康检查只由 Cron Trigger 或内部受保护接口触发。
- 保留当前 Dashboard、分组、通知、状态 API 和 provider 检查能力。

Non-Goals:

- 不在本仓库实现管理后台。
- 不继续维护 Next.js runtime 作为生产入口。
- 不支持低于 1 分钟的首版 Cron 检查频率。
- 不把 Supabase/PostgreSQL schema 原样迁移到 D1。
- 不在用户请求路径中触发 provider health check。

## Decisions

- Decision: Astro 使用静态输出，Worker 通过 Static Assets binding 服务页面。
  Alternatives considered: Astro SSR 或 React Router SSR。它们增加 Worker handler 复杂度，不符合当前单页状态面板需求。
- Decision: Hono 是唯一 API 入口。
  Alternatives considered: Astro API routes。Hono 更清晰地承载 Worker `fetch` 与 `scheduled` 入口，也更接近 Cloudflare fullstack 模板。
- Decision: D1 中建立 `check_latest`、`availability_rollups` 和 `dashboard_snapshots`。
  Alternatives considered: 每次 API 请求扫描 `check_history`。该方案读放大明显，无法保证 Dashboard 稳定快速。
- Decision: Drizzle 管 schema、类型和常规 CRUD，复杂批量写和聚合允许手写 SQL。
  Alternatives considered: 全部手写 SQL。该方案迁移速度快但类型漂移风险高。
- Decision: Provider API key 迁移为加密字段。
  Alternatives considered: 继续明文保存在数据库。D1 没有 Supabase RLS 和 service role 边界，不应延续明文存储。

## Risks / Trade-offs

- D1 写入压力：每分钟批量写历史可能成为瓶颈。缓解方式是 bounded concurrency、批量写入、保留周期限制、`check_latest` 与 snapshot 降低读取压力。
- OpenSpec CLI 不可用：当前仓库没有本地 `openspec` 命令。缓解方式是按 OpenSpec 文件格式创建 proposal 和 deltas，并在验证记录中明确 CLI 环境阻塞。
- 旧 API 兼容风险：迁移过程中必须保留旧响应样例并建立 contract tests。
- UI 迁移风险：单页化不能丢失分组能力。缓解方式是用 group tabs/filter/query/detail panel 保留原行为。

## Migration Plan

1. 创建 OpenSpec proposal、设计说明和 superpowers 风格执行计划。
2. 建 Astro + Hono + Worker skeleton，并保留旧代码直到对应能力迁移完成。
3. 建 D1 + Drizzle schema、migrations 和 repository。
4. 迁移 provider check runtime 到 Worker-safe 纯逻辑。
5. 实现 Cron health check job、job lock、rollup 和 snapshot。
6. 实现 Hono API 兼容层。
7. 迁移 Dashboard 到 Astro 单页和 React island。
8. 提供 Supabase 到 D1 的一次性迁移脚本。
9. 并行验证、性能检查和切流 runbook。

## Open Questions

- 远端 D1 数据库 ID 需要在 Cloudflare 账户中创建后填入 `wrangler.jsonc`。
- 实际 provider key 加密迁移需要生产密钥材料，实施时通过 `wrangler secret put CONFIG_ENCRYPTION_KEY` 注入。
