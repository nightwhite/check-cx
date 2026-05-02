# Workers + Astro + D1 改造规划

## 目标

将 Check CX 改造成加载速度稳定、运行模型清晰的 Cloudflare Workers 项目。

目标架构：

```text
Astro 静态前端
  -> Workers Static Assets
  -> Hono Worker API
  -> D1 + Drizzle
  -> Cron Trigger 执行健康检查
```

本轮规划只覆盖迁移方案，不直接改业务源码。

## 非目标

- 不继续维护 Next.js App Router 作为运行时入口。
- 不把 Supabase SQL 原样迁移到 D1。
- 不在用户请求中触发模型健康检查。
- 不在 Worker 中使用常驻 `setInterval` 作为业务调度机制。
- 不在第一阶段引入完整管理后台重写。

## 当前项目判断

当前项目的核心能力是：

- Dashboard 和分组详情展示。
- 对外只读状态 API。
- 系统通知展示。
- 后台轮询 AI Provider，写入历史状态。
- 基于 Supabase 的配置、历史、分组和通知存储。

这些能力不需要 Next.js SSR。当前 Next.js 的主要成本来自：

- `instrumentation.ts` 和 `app/layout.tsx` 启动常驻轮询器。
- `lib/core/poller.ts` 在模块加载时通过 `setInterval` 持续执行。
- `lib/core/health-snapshot-service.ts` 在部分请求路径中主动触发健康检查。
- Supabase schema 使用 PostgreSQL enum、`uuid`、`jsonb`、`timestamptz`、RLS、PL/pgSQL 函数和 RPC，这些都不是 D1 的直接模型。

## 参考项目结论

### `astro-blog-starter-template`

适合借鉴：

- Astro + `@astrojs/cloudflare` 的基础构建方式。
- 静态页面、内容集合、SEO 元信息和字体预加载组织方式。

不直接采用：

- Blog 模板的页面结构和样式不适合监控 Dashboard。
- 它没有 API、D1、Cron 和复杂交互组件。

### `saas-admin-template`

适合借鉴：

- Astro + React islands 的后台界面结构。
- shadcn/ui、Radix、lucide-react、TanStack Table 的组合。
- `wrangler.jsonc` 中 D1 binding、observability、source maps 的配置方式。
- D1 migration 目录和本地/远端迁移脚本组织。

需要调整：

- 模板用 Astro API route，不是 Hono。Check CX 应保留 Hono 作为 Worker API 层。
- 模板用 Tailwind v3 风格；新项目建议直接使用 Tailwind v4 + shadcn/ui 当前版本。
- 模板示例服务层直接写 D1 SQL；Check CX 建议用 Drizzle 管 schema 和常规查询，复杂查询保留手写 SQL。

### `react-postgres-fullstack-template`

适合借鉴：

- Hono API + Workers Static Assets 的单 Worker 模型。
- `/api/*` 由 Hono 处理，其余请求交给 `env.ASSETS.fetch()`。

不采用：

- Hyperdrive/Postgres 连接逻辑。
- React SPA 作为主前端框架。

### `react-router-hono-fullstack-template`

只做参考：

- Hono 与前端框架 SSR handler 的组合方式。

不建议作为基底：

- Check CX 不需要 React Router SSR。
- SSR 会增加 Worker bundle 和运行路径，不符合「稳定快速」的首要目标。

## 推荐架构

### 前端

选择 Astro，输出静态前端。

推荐模式：

- Astro 负责页面 shell、布局、元信息和静态资源。
- React islands 只用于需要交互的 Dashboard 区域。
- Dashboard 数据通过 `/api/dashboard` 拉取。
- 分组页通过 `/api/group/:groupName` 拉取。
- 状态 API 页面不需要 SSR，直接作为静态文档或链接。

运行形态：

```text
src/pages/index.astro
src/pages/group/[groupName].astro
src/components/*.astro
src/components/dashboard/*.tsx
src/styles/global.css
```

Astro 建议使用静态输出优先：

```ts
// astro.config.mjs
export default defineConfig({
  output: "static",
  integrations: [react()],
});
```

原因：

- 静态前端可由 Workers Static Assets 直接缓存和分发。
- Hono Worker 可以独立处理 `/api/*` 和 `scheduled()`。
- 避免把 Astro SSR 和 Hono API 强行揉进同一个 handler。

如果后续确实需要服务端渲染页面，再评估 Astro `output: "server"`，但第一阶段不建议。

### 后端

选择 Hono Worker API。

推荐入口：

```ts
// src/worker/index.ts
import { Hono } from "hono";
import { runHealthCheckJob } from "./jobs/run-health-check";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/dashboard", dashboardRoutes);
app.route("/api/group", groupRoutes);
app.route("/api/v1/status", statusRoutes);
app.route("/api/notifications", notificationRoutes);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runHealthCheckJob(env, controller.scheduledTime));
  },
};
```

关键约束：

- 所有 Promise 必须 `await`、`return` 或放入 `ctx.waitUntil()`。
- 不使用模块级可变状态保存请求级数据。
- 不使用 `setInterval` 执行业务调度。
- 使用 `wrangler types` 生成 Env 类型，不手写 binding 类型作为最终真相。

### 数据库

选择 D1。

D1 是 SQLite 语义，不是 PostgreSQL。迁移时要重新建模：

| 当前 Supabase | D1 设计 |
| --- | --- |
| `uuid` | `TEXT`，由 Worker 使用 `crypto.randomUUID()` 生成 |
| `jsonb` | `TEXT` 存 JSON 字符串，应用层解析 |
| `timestamptz` | `INTEGER` epoch milliseconds |
| PostgreSQL enum | `TEXT CHECK (...)` |
| RLS | Worker API 鉴权和路由隔离 |
| RPC / PL/pgSQL | Worker query/service 函数 |
| View 聚合 | 预计算表或手写 SQL 查询 |

推荐表：

```text
check_request_templates
check_models
check_configs
check_history
check_latest
availability_rollups
dashboard_snapshots
group_info
system_notifications
official_status_snapshots
job_locks
job_runs
```

#### 配置与密钥

当前 `check_configs.api_key` 是明文数据库字段。迁移到 D1 时不建议继续明文存储。

推荐：

- D1 存 `api_key_ciphertext`、`api_key_nonce`、`api_key_version`。
- Worker Secret 存 `CONFIG_ENCRYPTION_KEY`。
- Worker 运行健康检查前使用 Web Crypto 解密。
- API 响应永远不返回密钥字段。

#### 快照表

为了加载稳定快速，应避免 Dashboard API 每次扫描历史大表。

推荐：

- `check_latest`：每个配置最新状态。
- `availability_rollups`：按天聚合可用性统计。
- `dashboard_snapshots`：按 period 保存完整 Dashboard JSON。

`/api/dashboard` 首选读取 `dashboard_snapshots`，没有快照时才降级组合 `check_latest` 和 rollup。

### Drizzle

建议使用 Drizzle，但限定使用边界。

使用 Drizzle 做：

- D1 schema 定义。
- 类型推导。
- 常规 CRUD。
- migration 生成。

保留手写 SQL 做：

- 最近 N 条历史的窗口查询。
- Dashboard 快照 upsert。
- 批量写入历史。
- 大表清理。

推荐目录：

```text
src/worker/db/schema.ts
src/worker/db/client.ts
src/worker/db/queries/
drizzle.config.ts
drizzle/
  migrations/
```

`wrangler.jsonc`：

```jsonc
{
  "name": "check-cx-workers",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-05-02",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "check-cx",
      "database_id": "<remote-d1-id>",
      "migrations_dir": "drizzle/migrations"
    }
  ],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "triggers": {
    "crons": ["*/1 * * * *"]
  }
}
```

注意：`database_id` 必须由真实 Cloudflare D1 数据库创建后填入。

### Cron Trigger

健康检查由 Cron Trigger 执行。

推荐周期：

- 第一阶段：每 1 分钟一次。
- 若需要低于 1 分钟的检测频率，不应继续用 Cron，应另行评估 Durable Object alarms 或保留外部调度器。

执行流程：

```text
scheduled()
  -> acquire job_locks
  -> load enabled configs
  -> decrypt provider API keys
  -> run provider checks with bounded concurrency
  -> insert check_history
  -> upsert check_latest
  -> update availability_rollups
  -> write dashboard_snapshots
  -> prune old history in small batches
  -> write job_runs
```

锁设计：

- `job_locks.job_name = "health-check"`
- `locked_until_ms`
- `owner_id`
- 只有锁过期才允许新任务获得执行权。

这样可以避免 Cron 重叠执行。

## UI 组件选择

### 结论

推荐：

- Astro 组件：布局、页面 shell、静态区域。
- React islands：Dashboard、筛选、表格、交互图表、表单。
- shadcn/ui：基础 UI 组件。
- Radix UI：只安装 shadcn 组件实际依赖的 primitives。
- lucide-react：图标。
- TanStack Table：配置列表、状态列表、分组表格。
- 自定义 SVG/CSS timeline：状态时间线。
- Recharts：先不作为核心依赖；若保留趋势图，做懒加载 island。

### 组件分层

```text
src/components/layout/
  AppShell.astro
  Header.astro
  Footer.astro

src/components/ui/
  button.tsx
  badge.tsx
  card.tsx
  table.tsx
  tabs.tsx
  tooltip.tsx
  dialog.tsx
  select.tsx

src/components/dashboard/
  DashboardIsland.tsx
  StatusSummary.tsx
  ProviderTable.tsx
  StatusTimeline.tsx
  GroupFilter.tsx
  NotificationBanner.tsx
```

### 为什么不用大型组件库

不建议 Ant Design、MUI 或全量 admin kit。

原因：

- Dashboard 是高频扫描型工具，不需要复杂企业级组件套件。
- 大型组件库增加首屏 JS 和 CSS。
- 当前项目已有 shadcn 风格组件，迁移成本低。
- SaaS Admin 模板也验证了 Astro + React + shadcn/ui + D1 的组合可行。

### Tailwind 版本

建议新项目使用 Tailwind v4。

原因：

- 当前项目已经使用 Tailwind v4。
- shadcn/ui 当前文档已经支持 Astro + Tailwind v4。
- SaaS Admin 模板中的 Tailwind v3 配置可以作为结构参考，但不作为新代码的版本基线。

## API 规划

保留现有对外路径，降低迁移风险：

| 路径 | 迁移后行为 |
| --- | --- |
| `GET /api/dashboard?trendPeriod=7d` | 读取 `dashboard_snapshots` |
| `GET /api/group/:groupName?trendPeriod=7d` | 读取分组快照或按 group 聚合 |
| `GET /api/v1/status?group=&model=` | 读取 `check_latest` 和必要历史 |
| `GET /api/notifications` | 读取活跃通知 |
| `GET /api/internal/cache-metrics` | 改为 Worker/D1/job 指标 |

新增内部接口：

| 路径 | 用途 |
| --- | --- |
| `POST /api/internal/run-health-check` | 手动触发一次检查，需内部 token |
| `GET /api/internal/job-runs` | 查看 Cron 执行记录 |
| `GET /api/internal/db-health` | D1 基础健康检查 |

## 迁移切片

### 第 0 阶段：冻结和基线

- 保留当前 Next.js 项目快照到 `reference/current-check-cx/`。
- 记录旧接口响应样例。
- 记录当前 Supabase 表结构和最近 30 天数据量。

验收：

- 能对比旧 API 和新 API 的响应字段。

### 第 1 阶段：新项目骨架

- 建 Astro 静态前端。
- 建 Hono Worker API。
- 配置 Workers Static Assets。
- 配置 `wrangler.jsonc`、observability、source maps。
- 添加 `scheduled()` 空任务。

验收：

- `wrangler dev` 可启动。
- `/` 返回 Astro 页面。
- `/api/health` 返回 JSON。
- 本地 scheduled handler 可触发。

### 第 2 阶段：D1 + Drizzle

- 创建 D1 数据库。
- 建 Drizzle schema。
- 生成并应用 migrations。
- 实现 `db/client.ts` 和基础 repository。

验收：

- 本地 D1 migration 通过。
- 远端 D1 migration 通过。
- `wrangler types` 生成 Env。
- repository 单测或脚本 smoke test 通过。

### 第 3 阶段：数据迁移

- 写 Supabase 导出脚本。
- 转换字段类型：
  - UUID -> TEXT
  - JSONB -> JSON string
  - timestamptz -> epoch milliseconds
- 对 provider API key 做加密迁移。
- 只迁最近 30 天历史，旧历史归档。

验收：

- 配置、模型、模板、分组、通知数量一致。
- 最近状态和旧系统一致。
- API key 不以明文写入 D1。

### 第 4 阶段：健康检查 Job

- 把 `runProviderChecks` 改为 Worker-safe 纯函数。
- 移除 Node/Next 专属依赖。
- 使用 `p-limit` 或自定义并发控制。
- 写入 `check_history`、`check_latest`、`availability_rollups`。
- 写入 `dashboard_snapshots`。

验收：

- 手动触发一次 health check 成功。
- Cron 自动执行成功。
- 重叠触发时只有一个 job 获得锁。

### 第 5 阶段：API 迁移

- 实现 dashboard/group/status/notifications API。
- 对齐旧响应字段。
- 添加 ETag 和缓存头。

验收：

- 旧前端可以临时指向新 API 做兼容验证。
- API P95 主要由 D1 读取小结果集决定，不触发模型检查。

### 第 6 阶段：前端迁移

- 迁移 Dashboard UI 到 Astro + React islands。
- 迁移主题、通知、状态卡、分组、时间线。
- 优先复用当前业务组件逻辑，删除 Next.js 依赖。

验收：

- 首屏 HTML 可直接显示 shell。
- Dashboard island 加载后填充数据。
- 移动端和桌面端布局不溢出。

### 第 7 阶段：切流和收尾

- 新旧系统并行运行至少 24 小时。
- 对比状态结果、延迟、可用性统计。
- 切换域名或路由。
- 删除旧 Supabase service role 依赖。

验收：

- 新系统 Cron 稳定。
- Dashboard 数据连续。
- 无明文密钥泄露。
- Workers Observability 中无持续错误。

## 风险和决策点

### D1 单库写入压力

风险：检查配置很多时，每分钟批量写入历史可能让 D1 成为瓶颈。

缓解：

- 批量 insert。
- 限制保留周期。
- 写 `check_latest` 和 rollup，减少读放大。
- 后续如数据量过大，再拆历史归档或引入 R2。

### 低于 1 分钟的轮询

风险：Cron Trigger 不适合 15 秒级轮询。

决策：

- 第一阶段固定 60 秒。
- 如确实需要 15 秒，单独设计调度方案，不在本次迁移里解决。

### Astro + Hono 集成

风险：Astro SSR Worker 和 Hono Worker 都想成为入口。

决策：

- 第一阶段 Astro 静态输出，Hono 是唯一 Worker 入口。
- 静态资源交给 `ASSETS` binding。
- 避免 Astro SSR 和 Hono wrapper 的复杂组合。

### 组件库重量

风险：React islands 过大，抵消 Astro 静态优势。

缓解：

- 只在 Dashboard 主体和表格上使用 React。
- 时间线用自定义 SVG/CSS。
- 图表懒加载。
- 不引入完整 admin kit。

## 建议依赖

前端：

```json
{
  "astro": "^5",
  "@astrojs/react": "^4",
  "@astrojs/cloudflare": "^12",
  "react": "^19",
  "react-dom": "^19",
  "tailwindcss": "^4",
  "lucide-react": "^0.5",
  "class-variance-authority": "^0.7",
  "clsx": "^2",
  "tailwind-merge": "^3",
  "@radix-ui/react-dialog": "^1",
  "@radix-ui/react-tooltip": "^1",
  "@radix-ui/react-select": "^2",
  "@tanstack/react-table": "^8"
}
```

后端：

```json
{
  "hono": "^4",
  "drizzle-orm": "^0.4",
  "drizzle-kit": "^0.3",
  "ai": "^5",
  "@ai-sdk/openai": "^2",
  "@ai-sdk/anthropic": "^2",
  "@ai-sdk/google": "^2",
  "zod": "^4",
  "wrangler": "^4",
  "@cloudflare/workers-types": "^4"
}
```

实际版本以 `pnpm add` 时的最新兼容版本为准。

## 验证清单

- `pnpm build`
- `pnpm typecheck`
- `wrangler types`
- `wrangler d1 migrations apply DB --local`
- `wrangler d1 migrations apply DB --remote`
- `wrangler deploy --dry-run`
- 本地 `scheduled()` smoke test
- Dashboard API 响应字段对比
- Provider 检查真实请求 smoke test
- Lighthouse 或 WebPageTest 首屏体积检查
- Workers Observability 错误率检查

## 最终建议

采用用户建议的方向：

```text
Astro 前端
+ Hono Worker API
+ D1
+ Drizzle
+ Cron Trigger
+ shadcn/ui + Radix + lucide + TanStack Table
```

其中最关键的工程边界是：Astro 只负责静态前端，不让页面请求承担健康检查；Hono Worker 是唯一 API 和 Cron 入口；D1 通过快照和 rollup 表保证读取稳定快速。

## 参考资料

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare Astro framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Drizzle Cloudflare D1 guide](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- [shadcn/ui Astro guide](https://ui.shadcn.com/docs/installation/astro)
