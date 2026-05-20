# Workers Admin Console 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `using-superpowers` 检查本阶段适用 skills；实现任务使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现。每个任务必须使用复选框（`- [ ]`）推进，并在完成前使用 `verification-before-completion`。

**目标：** 在当前 Cloudflare Workers/Astro/D1 项目内实现一个轻量管理台，用于维护 Check CX 的 Provider 配置、模型、请求模板、分组、通知和 Cron 运行状态。

**架构：** Astro 提供 admin shell，React island 承载管理台交互；Hono 暴露固定 `/api/admin/*` API；D1 是唯一管理数据源；provider key 通过 Worker Web Crypto 加密写入；Cloudflare Cron 继续每分钟执行，Admin 只读展示运行状态。

**技术栈：** Astro、React、Hono、D1、Drizzle schema、Wrangler、Tailwind CSS v4、shadcn/ui 风格 primitives、Radix、lucide-react、Vitest。

---

## Skills 总规则

所有编程相关工作必须遵循仓库根目录 `AGENTS.md` 中的 `karpathy-guidelines` 要求。任何 fallback 或兼容策略都必须先向用户确认。

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
- 中文文档：`chinese-documentation`
- 多任务执行：`subagent-driven-development`
- 单线程执行：`executing-plans`
- 测试先行：`test-driven-development`
- UI 规划和实现：`shape`、`impeccable`
- Workers/Wrangler/Cron：按项目已有 Cloudflare Workers 最佳实践执行
- 调试：`systematic-debugging`
- 完成前验证：`verification-before-completion`
- 代码审查：`requesting-code-review`
- 分支收尾：`finishing-a-development-branch`
- commit：项目 Conventional Commits 规范

## 已确认产品边界

- `ADMIN_TOKEN` 是唯一鉴权凭据。
- 登录 session 默认 30 天。
- Admin 页面路径由 `ADMIN_PATH` 指定，本地默认 `/admin`。
- Admin API 固定 `/api/admin/*`。
- v1 不做批量操作。
- API key 只允许创建或替换，不允许读取明文。
- Cron 默认每分钟一次，Admin 只读展示，不提供编辑入口。
- 不迁移用户系统、角色权限、OAuth、Supabase service role 或 Next.js Server Actions。

## 文件结构规划

- `openspec/changes/add-workers-admin-console/`：OpenSpec proposal、design、tasks 和 spec delta。
- `docs/superpowers/specs/2026-05-20-workers-admin-console-design.md`：admin 设计规格。
- `docs/superpowers/plans/2026-05-20-workers-admin-console.md`：本实现计划。
- `src/worker/routes/admin/index.ts`：Admin route 聚合。
- `src/worker/routes/admin/auth.ts`：session 登录、查询、退出。
- `src/worker/routes/admin/summary.ts`：概览 API。
- `src/worker/routes/admin/runtime.ts`：Cron/job 只读运行状态 API。
- `src/worker/routes/admin/templates.ts`：请求模板 CRUD。
- `src/worker/routes/admin/models.ts`：模型 CRUD。
- `src/worker/routes/admin/configs.ts`：Provider 配置 CRUD 和 secret 替换。
- `src/worker/routes/admin/groups.ts`：分组 CRUD。
- `src/worker/routes/admin/notifications.ts`：通知 CRUD。
- `src/worker/routes/admin/validation.ts`：provider type、notification level、JSON 字段校验。
- `src/worker/routes/admin/session.ts`：cookie 签名、校验和过期处理。
- `src/worker/db/repositories/admin/`：Admin D1 repositories。
- `src/worker/crypto/provider-key.ts`：新增 `encryptProviderKey()`。
- `src/pages/admin.astro`：本地默认 `/admin` admin shell。
- `src/components/admin/admin-island.tsx`：Admin React 入口。
- `src/components/admin/`：登录、导航、表格、表单和运行状态组件。
- `components/ui/`：补充必要 shadcn/ui primitives。
- `test/worker/routes/admin/`：Admin route contract tests。
- `test/worker/db/admin/`：Admin repository tests。
- `test/worker/crypto/provider-key.test.ts`：provider key 加密/解密测试。
- `test/components/admin/`：核心 admin UI 状态测试。
- `docs/ADMIN.md`：本地测试和 Cloudflare secret 配置说明。

## 任务 0：规格与计划落地

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`brainstorming`、`writing-plans`、OpenSpec、`chinese-documentation`

**文件：**
- 创建：`docs/superpowers/specs/2026-05-20-workers-admin-console-design.md`
- 创建：`openspec/changes/add-workers-admin-console/proposal.md`
- 创建：`openspec/changes/add-workers-admin-console/design.md`
- 创建：`openspec/changes/add-workers-admin-console/tasks.md`
- 创建：`openspec/changes/add-workers-admin-console/specs/admin-console/spec.md`
- 创建：`docs/superpowers/plans/2026-05-20-workers-admin-console.md`

- [x] **步骤 0.1：确认 OpenSpec 当前状态**

运行：

```bash
openspec list
openspec list --specs
sed -n '1,260p' openspec/project.md
```

预期：没有同名 `add-workers-admin-console` change。若 `openspec` CLI 不可用，记录实际错误并继续按 OpenSpec 目录格式创建文件。

- [x] **步骤 0.2：创建 OpenSpec change**

`proposal.md` 必须包含：

```md
# Change: Add Workers Admin Console

## Why
当前 Workers/Astro/D1 版本缺少管理入口，配置、模型、模板、分组和通知仍需要通过迁移脚本或直接操作数据库维护。

## What Changes
- 新增 Astro + React island 管理台页面，页面路径由 `ADMIN_PATH` 指定，本地默认 `/admin`。
- 新增固定路径 Hono Admin API：`/api/admin/*`。
- 使用 `ADMIN_TOKEN` 环境变量进行登录，登录 session 默认有效期为 30 天。
- Provider API key 只允许创建或替换，不允许读取明文。
- 提供 Cron/job/runtime 只读状态页，Cron 默认每分钟一次。

## Impact
- Affected specs: admin-console, data-storage, health-check-runtime
- Affected code: worker routes, D1 repositories, crypto, Astro pages, admin React components, tests
```

- [x] **步骤 0.3：创建 admin-console spec delta**

必须覆盖：

```text
Admin Token Authentication
Admin API Authorization
Admin Config Management
Admin Catalog Management
Admin Runtime Status
Admin Worker Safety
```

- [ ] **步骤 0.4：验证 OpenSpec**

运行：

```bash
openspec validate add-workers-admin-console --strict
```

预期：PASS。若 CLI 不可用，保留 `tasks.md` 中的未完成验证项，不声称 strict validate 已通过。

- [x] **步骤 0.5：Commit**

```bash
git add docs/superpowers/specs/2026-05-20-workers-admin-console-design.md \
  docs/superpowers/plans/2026-05-20-workers-admin-console.md \
  openspec/changes/add-workers-admin-console
git commit -m "docs(admin): add workers admin console plan"
```

## 任务 1：Admin Auth 和 30 天 Session

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`test-driven-development`、`systematic-debugging`

**文件：**
- 创建：`src/worker/routes/admin/session.ts`
- 创建：`src/worker/routes/admin/auth.ts`
- 创建：`src/worker/routes/admin/index.ts`
- 修改：`src/worker/app.ts`
- 修改：`src/worker/env.d.ts`
- 测试：`test/worker/routes/admin/auth-route.test.ts`

- [x] **步骤 1.1：编写失败的 auth route tests**

测试必须覆盖：

```ts
it("logs in with ADMIN_TOKEN and sets a 30-day HttpOnly cookie", async () => {});
it("rejects an invalid admin token", async () => {});
it("returns 503 when ADMIN_TOKEN is missing", async () => {});
it("returns the current session for a valid cookie", async () => {});
it("logs out by expiring the session cookie", async () => {});
```

- [x] **步骤 1.2：运行测试确认失败**

运行：

```bash
pnpm test -- test/worker/routes/admin/auth-route.test.ts
```

预期：FAIL，原因是 `/api/admin/session` route 尚未注册。

- [x] **步骤 1.3：实现 session cookie**

实现要求：

```text
cookie name: check_cx_admin_session
max age: 2592000 seconds
flags: HttpOnly; SameSite=Lax; Path=/; Secure when request protocol is https
signature: HMAC-SHA-256 derived from ADMIN_TOKEN
payload: expiresAtMs and nonce
```

禁止：

```text
明文写入 ADMIN_TOKEN
匿名开发模式
ADMIN_TOKEN 缺失时自动放行
```

- [x] **步骤 1.4：注册 admin routes**

`src/worker/app.ts` 添加：

```ts
import { adminRoutes } from "./routes/admin";

app.route("/api/admin", adminRoutes);
```

- [x] **步骤 1.5：验证**

运行：

```bash
pnpm test -- test/worker/routes/admin/auth-route.test.ts
pnpm typecheck
```

预期：auth route tests 与 typecheck 通过。

- [x] **步骤 1.6：Commit**

```bash
git add src/worker/routes/admin src/worker/app.ts src/worker/env.d.ts test/worker/routes/admin/auth-route.test.ts
git commit -m "feat(admin): add token session authentication"
```

## 任务 2：Admin D1 Repository 和 Provider Key 加密

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`test-driven-development`、`systematic-debugging`

**文件：**
- 创建：`src/worker/db/repositories/admin/types.ts`
- 创建：`src/worker/db/repositories/admin/templates.ts`
- 创建：`src/worker/db/repositories/admin/models.ts`
- 创建：`src/worker/db/repositories/admin/configs.ts`
- 创建：`src/worker/db/repositories/admin/groups.ts`
- 创建：`src/worker/db/repositories/admin/notifications.ts`
- 创建：`src/worker/db/repositories/admin/runtime.ts`
- 修改：`src/worker/crypto/provider-key.ts`
- 测试：`test/worker/db/admin/*.test.ts`
- 测试：`test/worker/crypto/provider-key.test.ts`

- [x] **步骤 2.1：编写 provider key crypto 测试**

测试必须覆盖：

```ts
it("encrypts and decrypts a provider key with AES-GCM", async () => {});
it("uses a new nonce for each encryption", async () => {});
it("rejects invalid CONFIG_ENCRYPTION_KEY length", async () => {});
```

- [x] **步骤 2.2：实现 `encryptProviderKey()`**

目标签名：

```ts
export async function encryptProviderKey(
  plaintext: string,
  rawKey: string
): Promise<EncryptedProviderKey>;
```

实现必须使用 `crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes)`，nonce 使用 12 字节随机值，输出 base64 字符串。

- [x] **步骤 2.3：编写 repository smoke tests**

覆盖：

```text
template create/list/update/delete
model create/list/update/delete
config create/list/update/delete without returning secrets
config replace secret updates encrypted fields only
group create/list/update/delete
notification create/list/update/delete
runtime status reads job_runs/job_locks/snapshots/latest
```

- [x] **步骤 2.4：实现 repositories**

关键约束：

```text
所有列表按 updated_at_ms 或 created_at_ms 倒序
删除 model 前检查 check_configs 引用
删除 template 前检查 check_models 引用
config list 返回 hasApiKey，不返回 ciphertext/nonce
JSON 字段写入前 stringify，读取后 parse
```

- [x] **步骤 2.5：验证**

运行：

```bash
pnpm test -- test/worker/crypto/provider-key.test.ts test/worker/db/admin
pnpm typecheck
```

预期：crypto 与 repository tests 通过。

- [x] **步骤 2.6：Commit**

```bash
git add src/worker/crypto/provider-key.ts src/worker/db/repositories/admin test/worker/crypto test/worker/db/admin
git commit -m "feat(admin): add d1 repositories and key encryption"
```

## 任务 3：Admin API Contract

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`test-driven-development`、`systematic-debugging`

**文件：**
- 创建：`src/worker/routes/admin/validation.ts`
- 创建：`src/worker/routes/admin/templates.ts`
- 创建：`src/worker/routes/admin/models.ts`
- 创建：`src/worker/routes/admin/configs.ts`
- 创建：`src/worker/routes/admin/groups.ts`
- 创建：`src/worker/routes/admin/notifications.ts`
- 创建：`src/worker/routes/admin/summary.ts`
- 创建：`src/worker/routes/admin/runtime.ts`
- 修改：`src/worker/routes/admin/index.ts`
- 测试：`test/worker/routes/admin/*.test.ts`

- [x] **步骤 3.1：编写 API contract tests**

测试必须覆盖：

```text
GET /api/admin/summary
GET /api/admin/runtime
GET/POST/PATCH/DELETE /api/admin/templates
GET/POST/PATCH/DELETE /api/admin/models
GET/POST/PATCH/DELETE /api/admin/configs
POST /api/admin/configs/:id/secret
GET/POST/PATCH/DELETE /api/admin/groups
GET/POST/PATCH/DELETE /api/admin/notifications
所有未登录请求返回 401
所有 GET API 不触发 provider checks
```

- [x] **步骤 3.2：运行测试确认失败**

运行：

```bash
pnpm test -- test/worker/routes/admin
```

预期：FAIL，原因是 CRUD routes 尚未实现。

- [x] **步骤 3.3：实现请求校验**

校验规则：

```text
provider type: openai | gemini | anthropic
notification level: info | warning | error
name/model/endpoint/message/group_name 必填字段 trim 后不能为空
JSON 字段必须是 JSON object 或 null
model.template_id 存在时，template.type 必须等于 model.type
config.model_id 存在时，model.type 必须等于 config.type
```

- [x] **步骤 3.4：实现 CRUD routes**

所有写操作返回更新后的脱敏记录。删除操作返回 `{ ok: true }`。引用冲突返回 `409`，校验失败返回 `400`。

- [x] **步骤 3.5：验证**

运行：

```bash
pnpm test -- test/worker/routes/admin
pnpm typecheck
```

预期：admin API contract tests 与 typecheck 通过。

- [x] **步骤 3.6：Commit**

```bash
git add src/worker/routes/admin test/worker/routes/admin
git commit -m "feat(admin): add management api routes"
```

## 任务 4：Admin Astro Shell 与可配置路径

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`test-driven-development`

**文件：**
- 创建：`src/pages/admin.astro`
- 修改：`src/worker/index.ts`
- 修改：`src/worker/env.d.ts`
- 测试：`test/worker/index.test.ts`

- [x] **步骤 4.1：编写 Worker path tests**

测试必须覆盖：

```ts
it("serves assets normally for /", async () => {});
it("serves admin shell for /admin by default", async () => {});
it("serves admin shell for ADMIN_PATH when configured", async () => {});
it("does not route /api/admin through assets", async () => {});
```

- [x] **步骤 4.2：实现 `src/pages/admin.astro`**

页面要求：

```astro
---
import { AdminIsland } from "../components/admin/admin-island";
import "../styles/global.css";
---

<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Check CX Admin</title>
  </head>
  <body>
    <AdminIsland client:load />
  </body>
</html>
```

- [x] **步骤 4.3：实现 `ADMIN_PATH` 静态 shell 映射**

`src/worker/index.ts` 逻辑：

```text
/api/* 永远不走 assets fallback
ADMIN_PATH 缺省为 /admin
pathname 等于 ADMIN_PATH 或以 ADMIN_PATH + "/" 开头时，返回 /admin 静态 shell
其他路径保持现有 ASSETS.fetch 行为
```

不得添加任何未确认的 fallback 路由。

- [x] **步骤 4.4：验证**

运行：

```bash
pnpm test -- test/worker/index.test.ts
pnpm build
```

预期：Worker path tests 与 Astro build 通过。

- [x] **步骤 4.5：Commit**

```bash
git add src/pages/admin.astro src/worker/index.ts src/worker/env.d.ts test/worker/index.test.ts
git commit -m "feat(admin): add configurable admin shell"
```

## 任务 5：Admin UI 基础布局与登录

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`shape`、`impeccable`、`test-driven-development`

**文件：**
- 创建：`src/components/admin/admin-island.tsx`
- 创建：`src/components/admin/admin-api.ts`
- 创建：`src/components/admin/login-view.tsx`
- 创建：`src/components/admin/admin-shell.tsx`
- 创建：`src/components/admin/admin-nav.tsx`
- 创建：`src/components/admin/admin-types.ts`
- 创建/修改：`components/ui/input.tsx`
- 创建/修改：`components/ui/label.tsx`
- 创建/修改：`components/ui/tabs.tsx`
- 测试：`test/components/admin/admin-island.test.tsx`

- [x] **步骤 5.1：写 UI design brief**

brief 必须锁定：

```text
用户：维护 Check CX provider 配置和运行状态的人
首要动作：快速判断配置是否完整、Cron 是否持续运行、哪些配置处于维护或异常
视觉方向：运维控制台，密集、清晰、稳定、扫描效率高
反目标：不要营销页，不做重型 SaaS admin，不展示开发实现说明
```

本任务 UI design brief：

- 用户：维护 Check CX provider 配置和运行状态的人，通常是项目维护者或值班人员。
- 首要动作：快速确认是否已登录、配置管理入口是否可用、Cron 运行状态是否可进入查看。
- 视觉方向：运维控制台，使用深浅中性的工作台布局、紧凑导航、明确状态反馈和低装饰度表面。
- 布局策略：未登录时展示聚焦的 token 登录面板；登录后使用侧边导航 + 主内容工作区，移动端折叠为顶部导航。
- 关键状态：checking session、missing `ADMIN_TOKEN`、login error、authenticated shell、expired session。
- 文案边界：页面只出现登录、导航、状态和操作反馈；不展示架构说明、技能说明、开发计划或 Cloudflare 实现细节。
- 反目标：不要营销页，不做重型 SaaS admin，不添加批量操作入口，不展示 API key 明文或旧 key。

- [x] **步骤 5.2：编写 UI tests**

测试必须覆盖：

```text
未登录时显示 token 登录
ADMIN_TOKEN 缺失时显示不可登录状态
登录成功后显示 admin shell
session 过期时回到登录态
```

- [x] **步骤 5.3：实现登录和 shell**

导航项固定：

```text
概览
Provider 配置
模型
请求模板
分组
通知
运行状态
```

文案边界：

```text
只展示用户需要操作或判断的信息
不把架构说明、实现计划、技能说明写入页面
```

- [x] **步骤 5.4：验证**

运行：

```bash
pnpm test -- test/components/admin/admin-island.test.tsx
pnpm build
```

预期：admin island tests 与 build 通过。

- [x] **步骤 5.5：Commit**

```bash
git add src/components/admin components/ui test/components/admin
git commit -m "feat(admin): add login and console shell"
```

## 任务 6：Admin CRUD Views

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`shape`、`impeccable`、`test-driven-development`

**文件：**
- 创建：`src/components/admin/overview-view.tsx`
- 创建：`src/components/admin/configs-view.tsx`
- 创建：`src/components/admin/config-form.tsx`
- 创建：`src/components/admin/models-view.tsx`
- 创建：`src/components/admin/model-form.tsx`
- 创建：`src/components/admin/templates-view.tsx`
- 创建：`src/components/admin/template-form.tsx`
- 创建：`src/components/admin/groups-view.tsx`
- 创建：`src/components/admin/group-form.tsx`
- 创建：`src/components/admin/notifications-view.tsx`
- 创建：`src/components/admin/notification-form.tsx`
- 创建：`src/components/admin/runtime-view.tsx`
- 创建：`src/components/admin/data-table.tsx`
- 创建/修改：`components/ui/dialog.tsx`
- 创建/修改：`components/ui/textarea.tsx`
- 创建/修改：`components/ui/select.tsx`
- 测试：`test/components/admin/*.test.tsx`

- [x] **步骤 6.1：编写组件状态测试**

覆盖：

```text
configs list renders hasApiKey instead of key value
secret replacement form does not prefill key
no batch action controls are rendered
runtime view renders cron every-minute label read-only
empty table state renders create action
form validation errors are visible
```

- [x] **步骤 6.2：实现 CRUD views**

每个 view 使用同一套交互模型：

```text
顶部标题和主要操作按钮
搜索或筛选区
紧凑表格
单条新增/编辑 dialog
单条删除确认
保存中禁用当前按钮
失败时展示服务端错误
```

- [x] **步骤 6.3：实现 key 替换体验**

Provider 配置表格显示：

```text
hasApiKey=true -> 已配置
hasApiKey=false -> 未配置
```

替换 key dialog 只包含新 key 输入框和确认按钮，不显示旧 key。

- [x] **步骤 6.4：实现运行状态 view**

展示：

```text
Cron: 每 1 分钟
最近 job_runs
当前 job_locks
最近 dashboard snapshot
最近 check_latest
```

不提供编辑 Cron 的输入框或按钮。

- [x] **步骤 6.5：验证**

运行：

```bash
pnpm test -- test/components/admin
pnpm build
```

预期：admin component tests 与 build 通过。

- [x] **步骤 6.6：Commit**

```bash
git add src/components/admin components/ui test/components/admin
git commit -m "feat(admin): add management console views"
```

## 任务 7：文档、浏览器验证和最终收尾

**使用 skills：** `using-superpowers`、`karpathy-guidelines`、`verification-before-completion`、`requesting-code-review`、`finishing-a-development-branch`

**文件：**
- 创建：`docs/ADMIN.md`
- 修改：`README.md`
- 修改：`.env.example`
- 修改：`wrangler.jsonc`（如需补充 vars 示例，只能写非 secret 配置）

- [x] **步骤 7.1：补充配置文档**

`docs/ADMIN.md` 必须包含：

```text
本地 ADMIN_PATH=/admin
ADMIN_TOKEN 设置方式
CONFIG_ENCRYPTION_KEY 要求
Cloudflare secret 设置命令
如何进入 admin
如何替换 provider key
Cron 每分钟且不可在 admin 修改
```

- [x] **步骤 7.2：补充示例配置**

`.env.example` 只写占位值：

```env
ADMIN_PATH=/admin
ADMIN_TOKEN=replace-with-a-long-random-token
CONFIG_ENCRYPTION_KEY=replace-with-16-24-or-32-byte-key
```

不得写真实 secret。

- [x] **步骤 7.3：运行完整验证**

运行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm wrangler:types
pnpm deploy:dry-run
```

预期：全部通过。

- [x] **步骤 7.4：浏览器验证**

启动：

```bash
pnpm dev
```

用浏览器检查：

```text
http://127.0.0.1:8787/admin
未登录状态可用
登录后概览可用
Provider 配置列表不显示明文 key
替换 key dialog 不预填旧 key
运行状态页无 Cron 编辑入口
mobile viewport 无横向溢出
desktop viewport 无重叠
```

- [x] **步骤 7.5：代码审查**

使用 `requesting-code-review` 审查：

```text
Admin auth 安全性
secret 不回显
GET API 不触发 health check
Worker runtime 兼容性
UI 文案边界
```

- [x] **步骤 7.6：Commit**

```bash
git add docs/ADMIN.md README.md .env.example wrangler.jsonc
git commit -m "docs(admin): document worker admin console"
```

## 最终验收标准

- OpenSpec `add-workers-admin-console` 已创建。
- Superpowers 设计规格和实现计划已创建。
- `/admin` 本地可访问，生产可通过 `ADMIN_PATH` 改路径。
- `/api/admin/*` 固定且受 session 保护。
- `ADMIN_TOKEN` 登录 session 默认 30 天。
- API 响应不包含 provider 明文 key、ciphertext 或 nonce。
- 创建和替换 key 都使用 Worker Web Crypto 加密后写入 D1。
- v1 没有批量操作入口。
- Admin GET API 不触发 provider checks。
- Cron 默认每分钟一次，Admin 只读展示运行状态。
- `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm wrangler:types`、`pnpm deploy:dry-run` 通过。

## 执行记录

- OpenSpec CLI 当前不可用：`openspec` 返回 `command not found`，`pnpm exec openspec` 返回 `Command "openspec" not found`。因此步骤 0.4 保持未完成。
- 已提交分阶段实现：`b174e73`、`517559f`、`797e67b`、`e7b7007`、`f6bd00c`、`f6f3382`、`9af9aee`。
- 最新验证：`pnpm test` 通过 31 个测试文件、110 个测试；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm wrangler:types`、`pnpm deploy:dry-run`、`wrangler d1 migrations apply DB --local` 均为 exit 0。
- 浏览器验证使用 390px 移动视口检查 `/admin` 登录页和登录后的 shell：`scrollWidth=390`、`clientWidth=390`、offenders 为空；1440px 桌面视口 shell：`scrollWidth=1440`、`clientWidth=1440`、offenders 为空。
- 代码审查后修复：畸形 admin session cookie 不再导致 500，统一按未授权处理。
- 审查观察：当前 D1 schema 对 `check_models.template_id` 使用 `ON DELETE SET NULL`，因此删除模板时会解除模型引用，而不是按早期计划阻止删除。
