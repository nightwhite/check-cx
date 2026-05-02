# Workers D1 切流 Runbook

本文用于把 Check CX 从旧 Next.js + Supabase 运行时切到 Cloudflare Workers + Astro + Hono + D1。切流前必须完成 `docs/verification/workers-astro-d1-checklist.md`。

## Skills

本任务使用 skills：

- `using-superpowers`：检查适用技能。
- `karpathy-guidelines`：控制切流边界，不在切流时扩展功能。
- `verification-before-completion`：每个通过结论都必须有命令输出或线上观测证据。
- `cloudflare:workers-best-practices`、`cloudflare:wrangler`：按 Cloudflare Workers/D1/Cron 标准流程操作。
- `finishing-a-development-branch`：最终审查、提交和分支收尾。

## 0. 切流原则

- 新旧系统至少并行观察 24 小时。
- 切流后旧 Supabase 保持只读观察窗口，不立即删除。
- Dashboard 和 status API 必须字段兼容；不在切流窗口加入新功能。
- Cron Trigger 是唯一健康检查调度来源；GET API 不触发检查。
- 任何失败优先回滚流量，不在生产热修数据库结构。

## 1. 创建 D1

```bash
corepack pnpm exec wrangler d1 create check-cx
```

记录输出中的 `database_id`，替换 `wrangler.jsonc`：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "check-cx",
      "database_id": "<REAL_D1_DATABASE_ID>",
      "migrations_dir": "drizzle/migrations"
    }
  ]
}
```

替换后重新生成类型：

```bash
corepack pnpm exec wrangler types
```

## 2. 设置 Secrets

Provider key 解密密钥必须只放在 Workers Secret：

```bash
corepack pnpm exec wrangler secret put CONFIG_ENCRYPTION_KEY
```

要求：

- 长度为 16、24 或 32 字节。
- 与迁移脚本加密 provider key 使用的值一致。
- 不写入 `wrangler.jsonc`、源码、README 或提交记录。

## 3. 应用 Migrations

先本地验证：

```bash
corepack pnpm exec wrangler d1 migrations apply DB --local
```

再应用远端：

```bash
corepack pnpm exec wrangler d1 migrations apply DB --remote
```

验收：

```bash
corepack pnpm exec wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

必须包含 `check_configs`、`check_history`、`check_latest`、`dashboard_snapshots`、`job_locks`、`job_runs`。

## 4. 导出并导入数据

导出 Supabase：

```bash
SUPABASE_URL="https://..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
corepack pnpm dlx tsx scripts/migration/export-supabase.ts ./tmp/supabase-export
```

生成 D1 导入 SQL 或参数化语句：

```bash
CONFIG_ENCRYPTION_KEY="同 Worker Secret" \
corepack pnpm dlx tsx scripts/migration/import-d1.ts ./tmp/supabase-export > ./tmp/d1-import.sql
```

导入前检查：

```bash
rg -n "sk-[A-Za-z0-9_-]{8,}|SUPABASE_SERVICE_ROLE_KEY" ./tmp/d1-import.sql
```

预期：无输出。不要扫描 `api_key` 这个普通列名前缀，因为 D1 SQL 会合法包含 `api_key_ciphertext`、`api_key_nonce`、`api_key_version`。如果某些 Provider key 不以 `sk-` 开头，按实际密钥前缀追加扫描规则。

导入远端 D1：

```bash
corepack pnpm exec wrangler d1 execute DB --remote --file ./tmp/d1-import.sql
```

导入后抽查：

```bash
corepack pnpm exec wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS count FROM check_configs;"
corepack pnpm exec wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS plaintext_keys FROM check_configs WHERE api_key_ciphertext IS NULL AND is_maintenance = 0;"
```

## 5. 部署 Worker 并启动 Cron

先 dry-run：

```bash
corepack pnpm build
corepack pnpm exec wrangler deploy --dry-run
```

再部署：

```bash
corepack pnpm exec wrangler deploy
```

Cron Trigger 随部署配置生效。用 `wrangler dev --test-scheduled` 做本地 smoke，用远端 `job_runs` 做真实确认：

```bash
corepack pnpm exec wrangler d1 execute DB --remote --command "SELECT status, checked_count, started_at_ms, finished_at_ms, error_message FROM job_runs ORDER BY started_at_ms DESC LIMIT 10;"
```

## 6. 并行观察 24 小时

观察窗口内不切主域名，只使用 Workers preview 或临时子域名。

每小时检查：

- `job_runs` 连续成功，无持续 `failed`。
- `check_history` 持续增长。
- `check_latest` 时间连续更新。
- `/api/dashboard?trendPeriod=7d` 字段兼容，响应来自 snapshot。
- `/api/v1/status` 字段兼容。
- Workers Observability 无持续 5xx、CPU 超限、D1 错误。
- D1 查询无明显慢查询或热点表全表扫描。

API 对比：

```bash
OLD_CHECK_CX_BASE_URL="https://old.example.com" \
NEW_CHECK_CX_BASE_URL="https://new-worker.example.com" \
CHECK_CX_CONTRACT_GROUP="可选分组名" \
corepack pnpm dlx tsx scripts/verification/api-contract-check.ts
```

## 7. 切换 Route / Domain

切换前确认：

- `wrangler.jsonc` 中 route/domain 配置指向目标域名。
- DNS 和 Cloudflare route 不与旧 Worker 或 Pages 项目冲突。
- 旧系统保持只读，不再执行健康检查写入。

切换：

```bash
corepack pnpm exec wrangler deploy
```

切换后立即验证：

```bash
curl -sS https://<domain>/api/health
curl -sS "https://<domain>/api/dashboard?trendPeriod=7d" | head
curl -sS "https://<domain>/api/v1/status?group=&model=" | head
```

## 8. 回滚方式

如果切流后出现持续错误：

1. 将 Cloudflare route/domain 切回旧 Next.js 入口。
2. 保留新 Worker 和 D1，不删除数据。
3. 暂停或移除 Worker Cron route 前，确认旧轮询器已恢复。
4. 导出 `job_runs`、Workers Observability 错误和最近 30 分钟 API 响应样本。
5. 修复后重新执行 24 小时并行观察。

不要回滚 D1 migration，除非 D1 数据库本身损坏。更安全的方式是新建 D1、重跑迁移和导入。

## 9. 切流完成标准

- 24 小时并行观察通过。
- 新 Worker 的 Dashboard、group、status、notifications API contract 对比通过。
- Cron `job_runs` 连续成功。
- D1 中无明文 provider key。
- Workers Observability 无持续错误。
- 旧 Supabase 进入只读观察窗口。
- 最终代码审查通过并完成提交。
