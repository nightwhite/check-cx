# Check CX Workers 改造文档

本目录记录将当前 Check CX 从 Next.js + Supabase + 常驻进程轮询，改造为 Cloudflare Workers 原生架构的规划。

## 文档索引

- [Workers + Astro + D1 改造规划](./workers-astro-d1-migration-plan.md)

## 本地参考项目

参考项目保存在 `reference/`，该目录已加入 `.gitignore`，只作为本机分析材料，不进入仓库提交。

当前已保存：

- `reference/current-check-cx/`：当前项目快照，排除了 `.git`、`reference/`、依赖和构建产物。
- `reference/cloudflare-templates/react-postgres-fullstack-template/`：Cloudflare React + Worker API + Assets 参考。
- `reference/cloudflare-templates/react-router-hono-fullstack-template/`：Cloudflare React Router + Hono SSR 参考。
- `reference/cloudflare-templates/astro-blog-starter-template/`：Cloudflare Astro 静态内容参考。
- `reference/cloudflare-templates/saas-admin-template/`：Cloudflare Astro + React islands + shadcn/ui + D1 参考。
