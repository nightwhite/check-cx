# Workers Astro D1 迁移验证清单

本清单用于切流前验证新的 Cloudflare Workers 运行时。它不替代 24 小时并行观察；只有真实 D1、真实 secrets、旧站和新 Worker 同时可用后，才能把线上项标记为通过。

## Skills

本任务使用 skills：

- `using-superpowers`：检查适用技能。
- `karpathy-guidelines`：明确边界、验收标准和剩余风险。
- `verification-before-completion`：所有通过结论必须有新鲜命令输出。
- `cloudflare:web-perf`、`optimize`：验证静态首屏、Dashboard island 和 API 缓存路径。
- `requesting-code-review`：切流前做最终代码审查。

## API Contract

- [ ] 设置旧站和新 Worker 地址：

```bash
export OLD_CHECK_CX_BASE_URL="https://old.example.com"
export NEW_CHECK_CX_BASE_URL="https://new-worker.example.com"
export CHECK_CX_CONTRACT_GROUP="可选分组名"
```

- [ ] 运行 API contract 对比：

```bash
corepack pnpm dlx tsx scripts/verification/api-contract-check.ts
```

- [ ] 对比项：
  - `GET /api/dashboard?trendPeriod=7d`
  - `GET /api/dashboard?trendPeriod=15d`
  - `GET /api/dashboard?trendPeriod=30d`
  - `GET /api/group/:groupName?trendPeriod=7d`（设置 `CHECK_CX_CONTRACT_GROUP` 后启用）
  - `GET /api/v1/status?group=&model=`
  - `GET /api/notifications`

## Workers 运行时检查

- [x] 生产入口为 `src/worker/index.ts`，Next.js runtime 不再作为 Worker 入口。
- [x] `scheduled()` 使用 `ctx.waitUntil(runHealthCheckJob(...))`，健康检查由 Cron Trigger 触发。
- [x] Dashboard API 只读取 `dashboard_snapshots`，不会触发 provider check。
- [x] Group API 只读取 `dashboard_snapshots` 的 `group:<groupName>` 快照。
- [x] Cron 默认从 D1 `check_configs`、`check_models`、`check_request_templates` 加载配置。
- [x] Provider key 在 D1 中读取 `api_key_ciphertext` / `api_key_nonce` 并用 `CONFIG_ENCRYPTION_KEY` 解密。
- [x] Provider check 使用有界并发，避免一次 Cron 把所有配置同时打满。
- [x] Cron 写入 `check_history`、`check_latest`、`availability_rollups`、`dashboard_snapshots`、`job_runs`。
- [x] Cron 写入后裁剪旧 `check_history`。
- [ ] 远端 D1 已替换真实 `database_id`，不再使用占位 ID。
- [ ] `CONFIG_ENCRYPTION_KEY` 已用 `wrangler secret put` 注入，源码和 `wrangler.jsonc` 不含真实 secret。

## 反模式扫描

- [x] 无生产 Worker 业务 `setInterval`：

```bash
rg -n "setInterval|setTimeout\\(" src/worker src/pages src/components
```

说明：`check-provider.ts` 中的 `setTimeout` 仅用于请求超时控制，不是业务调度。

- [x] 无 request-triggered health check：

```bash
rg -n "runHealthCheckJob|checkProvider\\(" src/worker/routes src/worker/app.ts src/worker/index.ts
```

预期：`runHealthCheckJob` 只在 `src/worker/index.ts` 的 `scheduled()` 中出现。

- [x] 无 Worker 模块级请求状态：

```bash
rg -n "let .*Request|let .*Cache|const cache|globalThis" src/worker
```

- [x] 无未处理 promise：

```bash
corepack pnpm lint
corepack pnpm typecheck
```

本地验证记录：`corepack pnpm typecheck` 已通过；`rg` 扫描显示 Worker 中没有业务 `setInterval`、没有 route 触发 `runHealthCheckJob`、没有模块级请求 cache/state。secret 关键字扫描只命中文档中的占位命令和导入前检查命令。

## 性能检查

- [x] Astro 输出静态 shell，首屏不依赖服务端渲染。
- [x] React 交互集中在 `DashboardIsland`，避免整站 hydration。
- [x] Dashboard/group API 命中 snapshot，不扫描大历史表。
- [x] Dashboard/group API 返回 `ETag` 和 Cloudflare CDN cache headers。
- [ ] 用浏览器检查 desktop/mobile 无重叠、无横向溢出。
- [ ] 用 Chrome DevTools 或 Lighthouse 记录一次冷启动性能，保留 FCP/LCP/CLS 结果。

## 最终命令

切流前在真实配置上运行：

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm exec wrangler types --check
corepack pnpm exec wrangler d1 migrations apply DB --local
corepack pnpm exec wrangler deploy --dry-run
```

本地验证记录（2026-05-02）：

- `corepack pnpm test`：12 个测试文件、25 个测试通过。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm lint`：通过。
- `corepack pnpm build`：Astro static build 通过。
- `corepack pnpm exec wrangler types --check`：`worker-configuration.d.ts` 已是最新。
- `corepack pnpm exec wrangler d1 migrations apply DB --local`：无待应用 migration。
- `corepack pnpm exec wrangler deploy --dry-run`：通过，Worker bundle 92.19 KiB，gzip 22.41 KiB。

## 当前已知阻塞

- `openspec` CLI 当前不可用，`openspec validate refactor-workers-astro-d1-runtime --strict` 尚未通过本机验证。
- `wrangler.jsonc` 中的 D1 `database_id` 仍是占位值，远端 D1 migration 和真实 deploy 需要先替换。
- 24 小时并行观察尚未开始，不能声明切流完成。
