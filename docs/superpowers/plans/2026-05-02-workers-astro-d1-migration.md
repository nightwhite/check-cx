# Workers Astro D1 迁移实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `using-superpowers` 检查本阶段适用 skills；实现任务使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现。步骤使用复选框语法跟踪进度。

**目标：** 将 Check CX 从 Next.js + Supabase 迁移为 Cloudflare Workers 最佳实践架构：Astro 单页前端 + Hono Worker API + D1 + Drizzle + Cron Trigger。

**架构：** Astro 输出静态页面，React islands 承载 Dashboard 交互；Hono 是唯一 Worker API 入口；Cron Trigger 执行健康检查并写 D1 快照。迁移保留原版功能，不扩展管理后台，不保留多页面分组模式。

**技术栈：** Astro、React、Hono、Cloudflare Workers Static Assets、D1、Drizzle、Wrangler、shadcn/ui、Radix、lucide-react、TanStack Table。

---

## Skills 总规则

所有编程相关工作必须遵循 `/Users/night/Documents/code/su8/check-cx/AGENTS.md` 中的 `karpathy-guidelines` 要求。

每个任务开始前都必须写明：

```md
本任务使用 skills：
- using-superpowers：检查适用技能
- karpathy-guidelines：控制边界和验收标准
- <任务专项 skill>
```

专项 skill 规则：

- 计划/方案：`writing-plans`
- OpenSpec 变更：读取 `openspec/AGENTS.md`
- 多任务执行：`subagent-driven-development`
- 单线程执行：`executing-plans`
- 测试先行：`test-driven-development`
- Workers/Cron/wrangler：`cloudflare:workers-best-practices`、`cloudflare:wrangler`
- UI 规划和实现：`shape`、`impeccable`
- 性能：`cloudflare:web-perf`、`optimize`
- 调试：`systematic-debugging`
- 完成前验证：`verification-before-completion`
- 代码审查：`requesting-code-review`
- 分支收尾：`finishing-a-development-branch`
- 中文文档：`chinese-documentation`
- commit：`chinese-commit-conventions` 或项目现有 Conventional Commits

## 文件结构规划

- `openspec/changes/refactor-workers-astro-d1-runtime/`：OpenSpec proposal、design、tasks、spec deltas。
- `docs/superpowers/plans/2026-05-02-workers-astro-d1-migration.md`：本 superpowers 风格执行计划。
- `src/worker/index.ts`：Hono fetch + scheduled Worker 入口。
- `src/worker/routes/`：dashboard、group、status、notifications、internal routes。
- `src/worker/db/`：Drizzle schema、client、repositories。
- `src/worker/jobs/`：Cron health check、job lock、rollup、snapshot。
- `src/worker/providers/`：Worker-safe provider check 逻辑。
- `src/pages/index.astro`：单页 Dashboard shell。
- `src/components/dashboard/`：React Dashboard island 和交互组件。
- `src/components/ui/`：shadcn/ui primitives。
- `drizzle/migrations/`：D1 migrations。
- `scripts/migration/`：Supabase 导出、D1 导入、密钥加密迁移。
- `test/`：unit、integration、contract tests。

## 任务清单

### 任务 0：创建 OpenSpec Proposal 和 Superpowers 计划文档

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`writing-plans`、OpenSpec、`chinese-documentation`

- [x] 创建 proposal、design、tasks 和 spec deltas。
- [x] 创建本计划文档。
- [ ] 运行 `openspec validate refactor-workers-astro-d1-runtime --strict`。

备注：当前 shell 中 `openspec` 命令不可用，需要安装或提供 OpenSpec CLI 后补跑严格验证。

### 任务 1：建立 Astro + Hono + Workers Skeleton

**使用 skills：** `cloudflare:workers-best-practices`、`cloudflare:wrangler`、`test-driven-development`

- [x] 添加 Astro、Hono、Wrangler、Workers types、Vitest、D1 和 Drizzle 依赖。
- [x] 添加 `astro.config.mjs`、`wrangler.jsonc`、`src/worker/index.ts`、`/api/health`。
- [x] 添加最小 Astro 单页 shell。
- [x] 验证 `pnpm build`、`wrangler types`、`wrangler deploy --dry-run`。

### 任务 2：建立 D1 + Drizzle Schema

**使用 skills：** `test-driven-development`、`cloudflare:workers-best-practices`、`systematic-debugging`

- [x] 定义 D1 schema。
- [x] 添加 D1 migrations 和索引。
- [x] 添加 repository smoke tests。
- [ ] 验证本地和远端 D1 migrations。

备注：本地 D1 migration 已通过；远端 migration 需要把真实 Cloudflare D1 `database_id` 写入 `wrangler.jsonc` 后执行。

### 任务 3：迁移 Provider Health Check Runtime

**使用 skills：** `karpathy-guidelines`、`test-driven-development`、`systematic-debugging`

- [x] 迁移 Worker-safe provider check 模块。
- [x] 保留 OpenAI、Gemini、Anthropic、OpenAI-compatible、Chat Completions、Responses、endpoint ping、challenge、latency。
- [x] 添加 provider mock tests。

### 任务 4：实现 Cron Health Check Job

**使用 skills：** `cloudflare:workers-best-practices`、`cloudflare:wrangler`、`test-driven-development`

- [x] 实现 job lock。
- [x] 实现 `scheduled()` health check flow。
- [x] 从 D1 加载启用配置、解密 provider key，并使用有界并发执行检查。
- [x] 写入 history、latest、rollups、dashboard/group snapshots、job runs，并裁剪旧 history。
- [ ] 验证 scheduled smoke test 和重叠 job 行为。

### 任务 5：实现 Hono API 兼容层

**使用 skills：** `test-driven-development`、`cloudflare:workers-best-practices`、`requesting-code-review`

- [x] 实现 dashboard、group、status、notifications、internal routes。
- [x] 校验 `trendPeriod`。
- [x] 添加 ETag 和 cache headers。
- [ ] 验证旧 API contract。

### 任务 6：规划并迁移 Astro 单页 UI

**使用 skills：** `shape`、`impeccable`、`audit`、`optimize`、`cloudflare:web-perf`

- [x] 创建 UI design brief。
- [x] 迁移 Dashboard UI 到 React island。
- [ ] 把 group pages 折叠进单页。
- [ ] 验证桌面、移动端、loading、empty、error、retry 状态。

备注：当前已实现单页分组过滤；详情面板和原版完整拖拽排序仍需继续迁移。

### 任务 7：实现 Supabase 到 D1 数据迁移

**使用 skills：** `karpathy-guidelines`、`test-driven-development`、`systematic-debugging`

- [x] 添加 Supabase export、D1 import、provider key encryption scripts。
- [x] 转换 UUID、JSONB、timestamptz、enum 和 API key。
- [x] 迁移最近 30 天历史，并从历史记录派生 `check_latest`。
- [ ] 验证数量、关系和无明文 API key。

### 任务 8：性能、稳定性、安全验证

**使用 skills：** `verification-before-completion`、`cloudflare:web-perf`、`requesting-code-review`

- [x] 添加 API contract verification script。
- [x] 添加 Workers migration checklist。
- [x] 检查无 request-triggered health check、业务 `setInterval`、floating promises、hardcoded secrets。
- [x] 运行最终验证命令。

### 任务 9：并行运行和切流

**使用 skills：** `verification-before-completion`、`finishing-a-development-branch`

- [x] 添加 cutover runbook。
- [ ] 并行观察 24 小时。
- [ ] 切换 Cloudflare route/domain。
- [ ] 最终审查和收尾。
