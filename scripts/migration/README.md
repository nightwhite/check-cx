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
