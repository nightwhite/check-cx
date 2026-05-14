# Supabase 到 D1 迁移脚本

## 使用范围

这些脚本用于一次性迁移 Check CX 运行时数据：

- Supabase 导出：`export-supabase.ts`
- Provider key 加密：`encrypt-provider-keys.ts`
- D1 导入语句生成：`import-d1.ts`

## 环境变量

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CONFIG_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
```

`CONFIG_ENCRYPTION_KEY` 必须同步通过 Wrangler Secret 注入 Worker：

```bash
wrangler secret put CONFIG_ENCRYPTION_KEY
```

## 边界

- 默认只导出最近 30 天 `check_history`。
- D1 中不写入明文 `api_key`。
- 真实导入前必须先应用 D1 migration。
- 导出目录会临时保存 Supabase 原始数据，其中 `check_configs.jsonl` 包含明文 provider key。导入完成后必须删除该目录，不能提交、上传或共享。

## 执行顺序

```bash
SUPABASE_URL="https://..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
corepack pnpm dlx tsx scripts/migration/export-supabase.ts ./tmp/supabase-export

CONFIG_ENCRYPTION_KEY="同 Worker Secret" \
corepack pnpm dlx tsx scripts/migration/import-d1.ts ./tmp/supabase-export > ./tmp/d1-import.sql

corepack pnpm exec wrangler d1 execute DB --remote --file ./tmp/d1-import.sql
```

导入完成后删除临时导出目录和导入 SQL：

```bash
rm -rf ./tmp/supabase-export ./tmp/d1-import.sql
```

`import-d1.ts` 会导入模板、模型、配置、最近 30 天历史、分组、系统通知，并从历史记录派生 `check_latest` 和 `availability_rollups`。
