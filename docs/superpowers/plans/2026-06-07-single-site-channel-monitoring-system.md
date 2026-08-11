# 单站点渠道模型监控系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 把 Check CX 改造成单站点、可后台配置站点信息/渠道/模型监控/检查频次/飞书通知的专业渠道模型状态页系统。

**架构：** Cloudflare Workers + Astro + React + D1 保持不变。新增单站点配置表、渠道表、通知设置/事件表，并扩展现有模型与监控配置表；后台 Admin 负责配置，Cron 每分钟扫描 due 的监控项，前台、公开 JSON API、截图 PNG API 共享同一份 dashboard snapshot 语义。

**技术栈：** Astro、React 19、Hono、Cloudflare Workers、D1、Drizzle schema、Cloudflare Browser Rendering、Tailwind CSS、Vitest、Testing Library、Wrangler。

---

## 已确认产品边界

- 只做单站点，不做多站点平台。
- Logo 使用 URL 配置，不做文件上传，不引入 R2。
- 检查频次为全局默认 + 单监控项覆盖。
- 通知只做标准飞书 Webhook 通知，不做规则引擎和值班路由。
- `degraded` 需要通知，和 `failed`、恢复通知一起覆盖。
- `maintenance` 不触发通知。
- 同一监控项同一事件类型需要冷却，避免刷屏。
- 前台首页、`/api/public/status`、`/api/public/status-card.png` 必须表达同一套“渠道 → 模型 → 历史格”语义。
- 禁止添加未经确认的 fallback 逻辑；遇到需要兜底的地方先停下来确认。

## 最终用户体验

后台可配置：

- 站点信息：站点名、Logo URL、描述、公开域名、状态页标题、全局检查频次、通知冷却时间。
- 渠道：渠道名、Logo URL、官网链接、官方状态页链接、排序、启用状态。
- 模型：Provider 类型、模型名称、请求模板。
- 监控项：渠道、模型、Endpoint、API Key、Region/备注、单项检查频次覆盖、启用、维护状态。
- 飞书通知：Webhook URL、是否启用、延迟通知、异常通知、恢复通知。

前台展示：

- 顶部使用后台站点信息和 Logo。
- 按渠道分区展示。
- 每个渠道下按模型行展示。
- 每个模型行展示当前状态、延迟、可用率和最近 60 次检测格。
- 截图 API 截取同一个首页，不另写一套渲染。

## 文件结构

### 数据库与类型

- 修改：`drizzle/migrations/0001_initial.sql`，生产新库的完整 schema。
- 创建：`drizzle/migrations/0002_single_site_channel_monitoring.sql`，已有 D1 的增量迁移。
- 修改：`src/worker/db/schema.ts`，新增/扩展表定义。
- 修改：`src/worker/env.d.ts`，补充无新增必需 secret；飞书 Webhook 存 D1 加密字段。
- 修改：`src/components/admin/admin-types.ts`，新增 site/channel/notification settings/monitor config 字段。
- 修改：`lib/types/dashboard.ts`，新增 snapshot 中的 `site`、`channels` 结构，同时保留兼容字段直到前端切换完成。

### 后台 Admin

- 创建：`src/worker/db/repositories/admin/site-settings.ts`，站点配置读写。
- 创建：`src/worker/db/repositories/admin/channels.ts`，渠道 CRUD。
- 修改：`src/worker/db/repositories/admin/configs.ts`，监控项绑定 `channel_id`，支持 `check_interval_seconds`、`region`。
- 创建：`src/worker/db/repositories/admin/notification-settings.ts`，飞书通知设置读写。
- 创建：`src/worker/routes/admin/site-settings.ts`，站点设置 API。
- 创建：`src/worker/routes/admin/channels.ts`，渠道 API。
- 修改：`src/worker/routes/admin/configs.ts`，监控项 API。
- 创建：`src/worker/routes/admin/notification-settings.ts`，通知设置 API。
- 修改：`src/worker/routes/admin/index.ts`，注册新 API。
- 修改：`src/components/admin/admin-nav.tsx`，导航改为站点设置、渠道、模型、监控项、通知设置、运行状态。
- 创建：`src/components/admin/site-settings-view.tsx`，站点设置页。
- 创建：`src/components/admin/channel-form.tsx`，渠道表单。
- 创建：`src/components/admin/channels-view.tsx`，渠道列表。
- 修改：`src/components/admin/config-form.tsx`，配置渠道、频次覆盖、Region/备注。
- 修改：`src/components/admin/configs-view.tsx`，从 Provider 配置改为监控项。
- 创建：`src/components/admin/notification-settings-view.tsx`，飞书 Webhook 设置页。
- 修改：`src/components/admin/overview-view.tsx`，指标从“分组”改为“渠道”。
- 修改：`src/components/admin/admin-shell.tsx`，接入新页面。

### 运行时、调度与通知

- 修改：`src/worker/db/repositories/provider-configs.ts`，加载 due 监控项和频次字段。
- 修改：`src/worker/providers/types.ts`，Worker config 增加 channel/site/frequency 元数据。
- 修改：`src/worker/jobs/run-health-check.ts`，只检查 due 监控项，持久化后触发通知。
- 修改：`src/worker/jobs/persist-check-results.ts`，写入 latest 后保留旧状态供通知判断。
- 创建：`src/worker/jobs/notification-events.ts`，判断状态变化、冷却和记录发送事件。
- 创建：`src/worker/notifications/lark-webhook.ts`，发送飞书标准消息。
- 修改：`src/worker/jobs/write-dashboard-snapshot.ts`，写入站点、渠道、模型层级 snapshot。

### 前台、公开 API、截图 API

- 修改：`src/components/dashboard/dashboard-island.tsx`，渲染站点信息、渠道区块、模型行、检测历史格。
- 修改：`src/worker/routes/public-status.ts`，公开 JSON 输出 `site`、`channels[]`、`models[]`。
- 保持：`src/worker/routes/public-status-screenshot.ts`，继续打开 `/?period=...&screenshot=1` 并等待 `[data-dashboard-ready='true']`。
- 修改：`test/components/dashboard-island.test.tsx`，覆盖站点信息、渠道模型层级、ready 标记。
- 修改：`test/worker/routes/public-route.test.ts`，覆盖公开 JSON 和截图 URL/selector。

## 任务 1：数据库 schema 与迁移

**文件：**
- 修改：`src/worker/db/schema.ts`
- 修改：`drizzle/migrations/0001_initial.sql`
- 创建：`drizzle/migrations/0002_single_site_channel_monitoring.sql`
- 测试：`test/migration/single-site-channel-monitoring.test.ts`

- [x] **步骤 1：写迁移结构测试**

创建 `test/migration/single-site-channel-monitoring.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";

function statements(sql: string) {
  return sql
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

describe("single site channel monitoring migration", () => {
  it("creates site, channel and notification tables", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const initial = readFileSync("drizzle/migrations/0001_initial.sql", "utf8");
    const migration = readFileSync(
      "drizzle/migrations/0002_single_site_channel_monitoring.sql",
      "utf8"
    );

    for (const statement of statements(initial)) {
      db.run(statement);
    }
    for (const statement of statements(migration)) {
      db.run(statement);
    }

    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )[0].values.flat();
    expect(tables).toContain("site_settings");
    expect(tables).toContain("channels");
    expect(tables).toContain("notification_settings");
    expect(tables).toContain("notification_events");

    const configColumns = db
      .exec("PRAGMA table_info(check_configs)")[0]
      .values.map((row) => row[1]);
    expect(configColumns).toContain("channel_id");
    expect(configColumns).toContain("check_interval_seconds");
    expect(configColumns).toContain("last_checked_at_ms");
    expect(configColumns).toContain("region");
  });
});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/migration/single-site-channel-monitoring.test.ts
```

预期：FAIL，原因是 `0002_single_site_channel_monitoring.sql` 不存在。

- [x] **步骤 3：编写增量迁移**

创建 `drizzle/migrations/0002_single_site_channel_monitoring.sql`：

```sql
CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_name TEXT NOT NULL DEFAULT 'Check CX',
  status_title TEXT NOT NULL DEFAULT 'AI Model Status',
  description TEXT,
  logo_url TEXT,
  public_origin TEXT,
  default_check_interval_seconds INTEGER NOT NULL DEFAULT 60,
  notification_cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (id = 'default'),
  CHECK (default_check_interval_seconds BETWEEN 15 AND 3600),
  CHECK (notification_cooldown_seconds BETWEEN 60 AND 86400)
);

INSERT OR IGNORE INTO site_settings (id, site_name, status_title)
VALUES ('default', 'Check CX', 'AI Model Status');

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website_url TEXT,
  status_page_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT OR IGNORE INTO channels (id, name, website_url, sort_order, created_at_ms, updated_at_ms)
SELECT id, group_name, website_url, 0, created_at_ms, updated_at_ms
FROM group_info;

ALTER TABLE check_configs ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE check_configs ADD COLUMN check_interval_seconds INTEGER;
ALTER TABLE check_configs ADD COLUMN last_checked_at_ms INTEGER;
ALTER TABLE check_configs ADD COLUMN region TEXT;

UPDATE check_configs
SET channel_id = (
  SELECT channels.id FROM channels WHERE channels.name = check_configs.group_name
)
WHERE group_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_check_configs_channel_id ON check_configs(channel_id);
CREATE INDEX IF NOT EXISTS idx_check_configs_due ON check_configs(enabled, last_checked_at_ms);

CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  lark_webhook_ciphertext TEXT,
  lark_webhook_nonce TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  notify_degraded INTEGER NOT NULL DEFAULT 1,
  notify_failed INTEGER NOT NULL DEFAULT 1,
  notify_recovered INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (id = 'default')
);

INSERT OR IGNORE INTO notification_settings (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES check_configs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at_ms INTEGER NOT NULL,
  message TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_config_type_sent
ON notification_events(config_id, event_type, sent_at_ms);
```

- [x] **步骤 4：更新初始 schema**

修改 `drizzle/migrations/0001_initial.sql`，让全新 D1 直接包含 `site_settings`、`channels`、`notification_settings`、`notification_events`，并让 `check_configs` 包含 `channel_id`、`check_interval_seconds`、`last_checked_at_ms`、`region`。

- [x] **步骤 5：更新 Drizzle schema**

在 `src/worker/db/schema.ts` 新增表定义，并扩展 `checkConfigs` 字段。表名和列名必须与 SQL 完全一致。

- [x] **步骤 6：运行迁移测试**

运行：

```bash
pnpm vitest run test/migration/single-site-channel-monitoring.test.ts
```

预期：PASS。

## 任务 2：后台站点设置

**文件：**
- 创建：`src/worker/db/repositories/admin/site-settings.ts`
- 修改：`src/worker/db/repositories/admin/index.ts`
- 创建：`src/worker/routes/admin/site-settings.ts`
- 修改：`src/worker/routes/admin/index.ts`
- 修改：`src/components/admin/admin-types.ts`
- 修改：`src/components/admin/admin-api.ts`
- 创建：`src/components/admin/site-settings-view.tsx`
- 修改：`src/components/admin/admin-nav.tsx`
- 修改：`src/components/admin/admin-shell.tsx`
- 测试：`test/worker/routes/admin/site-settings-route.test.ts`
- 测试：`test/components/admin/site-settings-view.test.tsx`

- [x] **步骤 1：写 API 失败测试**

创建 `test/worker/routes/admin/site-settings-route.test.ts`，覆盖：

```ts
it("returns the single site settings record", async () => {});
it("updates site name, logo url, public origin and default interval", async () => {});
it("rejects invalid logo and public origin urls", async () => {});
it("rejects default intervals outside 15 to 3600 seconds", async () => {});
```

- [x] **步骤 2：运行 API 测试确认失败**

运行：

```bash
pnpm vitest run test/worker/routes/admin/site-settings-route.test.ts
```

预期：FAIL，原因是 `/api/admin/site-settings` 尚未注册。

- [x] **步骤 3：实现 repository**

`src/worker/db/repositories/admin/site-settings.ts` 导出：

```ts
export interface AdminSiteSettingsRecord {
  id: "default";
  siteName: string;
  statusTitle: string;
  description: string | null;
  logoUrl: string | null;
  publicOrigin: string | null;
  defaultCheckIntervalSeconds: number;
  notificationCooldownSeconds: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export function createAdminSiteSettingsRepository(db: D1Database) {
  return {
    async get(): Promise<AdminSiteSettingsRecord> {},
    async update(input: Omit<AdminSiteSettingsRecord, "id" | "createdAtMs" | "updatedAtMs"> & { nowMs: number }): Promise<AdminSiteSettingsRecord> {},
  };
}
```

`get()` 必须在缺失时创建默认记录，不使用运行时兜底值替代数据库记录。

- [x] **步骤 4：实现 route**

`src/worker/routes/admin/site-settings.ts` 提供：

```ts
.get("/", async (c) => c.json(await createAdminSiteSettingsRepository(c.env.DB).get()))
.put("/", async (c) => { ... })
```

校验：

```ts
siteName 必填
statusTitle 必填
logoUrl 可空；非空必须是 http/https URL
publicOrigin 可空；非空必须是 http/https origin
默认频次 15-3600
通知冷却 60-86400
```

- [x] **步骤 5：实现后台页面**

`site-settings-view.tsx` 表单字段：站点名、状态页标题、描述、Logo URL、公开域名、默认检查频次、通知冷却时间。保存成功后保留在当前页面，不跳转。

- [x] **步骤 6：运行测试**

运行：

```bash
pnpm vitest run test/worker/routes/admin/site-settings-route.test.ts
pnpm vitest run test/components/admin/site-settings-view.test.tsx
```

预期：PASS。

## 任务 3：后台渠道管理

**文件：**
- 创建：`src/worker/db/repositories/admin/channels.ts`
- 修改：`src/worker/db/repositories/admin/index.ts`
- 创建：`src/worker/routes/admin/channels.ts`
- 修改：`src/worker/routes/admin/index.ts`
- 修改：`src/components/admin/admin-types.ts`
- 修改：`src/components/admin/admin-api.ts`
- 创建：`src/components/admin/channel-form.tsx`
- 创建：`src/components/admin/channels-view.tsx`
- 修改：`src/components/admin/admin-nav.tsx`
- 修改：`src/components/admin/admin-shell.tsx`
- 测试：`test/worker/routes/admin/channels-route.test.ts`
- 测试：`test/components/admin/channels-view.test.tsx`

- [x] **步骤 1：写渠道 API 失败测试**

覆盖：

```ts
it("creates and lists channels ordered by sort order", async () => {});
it("updates channel logo urls and status page urls", async () => {});
it("rejects duplicate channel names", async () => {});
it("disables a channel without deleting monitor history", async () => {});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/routes/admin/channels-route.test.ts
```

预期：FAIL，原因是 route 尚未注册。

- [x] **步骤 3：实现渠道 repository 与 route**

渠道 record：

```ts
export interface AdminChannelRecord {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}
```

API：

```text
GET /api/admin/channels
POST /api/admin/channels
PUT /api/admin/channels/:id
DELETE /api/admin/channels/:id
```

删除规则：如果渠道被监控项引用，返回 conflict；允许通过 `enabled=false` 停用。

- [x] **步骤 4：实现后台渠道页面**

页面文案使用“渠道”，不要出现“分组”。字段：渠道名称、Logo URL、官网链接、官方状态页链接、排序、启用。

- [x] **步骤 5：运行测试**

运行：

```bash
pnpm vitest run test/worker/routes/admin/channels-route.test.ts
pnpm vitest run test/components/admin/channels-view.test.tsx
```

预期：PASS。

## 任务 4：监控项配置支持渠道与频次

**文件：**
- 修改：`src/worker/db/repositories/admin/configs.ts`
- 修改：`src/worker/routes/admin/configs.ts`
- 修改：`src/worker/db/repositories/admin/types.ts`
- 修改：`src/components/admin/admin-types.ts`
- 修改：`src/components/admin/config-form.tsx`
- 修改：`src/components/admin/configs-view.tsx`
- 测试：`test/worker/routes/admin/management-routes.test.ts`
- 测试：`test/components/admin/management-views.test.tsx`

- [x] **步骤 1：更新监控项 API 测试**

新增断言：创建配置时必须选择 `channelId`，可以设置 `checkIntervalSeconds` 和 `region`。示例 payload：

```ts
{
  name: "Claude 官方 Sonnet",
  type: "anthropic",
  modelId: "model-claude-sonnet",
  channelId: "channel-anthropic-official",
  endpoint: "https://api.anthropic.com/v1/messages",
  apiKey: "secret",
  checkIntervalSeconds: 30,
  region: "global",
  enabled: true,
  isMaintenance: false
}
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/routes/admin/management-routes.test.ts
```

预期：FAIL，原因是 config API 不接受 `channelId` 和频次字段。

- [x] **步骤 3：更新 repository 和 route**

`AdminConfigRecord` 增加：

```ts
channelId: string | null;
channelName: string | null;
channelLogoUrl: string | null;
checkIntervalSeconds: number | null;
region: string | null;
```

校验：

```text
channelId 必须存在且 enabled 不强制要求 true
checkIntervalSeconds 可空；非空必须 15-3600
region 可空；非空长度 <= 80
```

- [x] **步骤 4：更新后台表单和列表**

`ConfigForm`：

- “分组”字段改为“渠道”。
- 必须选择渠道。
- 新增“检查频次覆盖（秒）”。为空表示使用站点默认频次。
- 新增“Region / 备注”。

`ConfigsView`：标题从“Provider 配置”改为“监控项”，列显示渠道、模型、频次、Region、状态。

- [x] **步骤 5：运行测试**

运行：

```bash
pnpm vitest run test/worker/routes/admin/management-routes.test.ts
pnpm vitest run test/components/admin/management-views.test.tsx
```

预期：PASS。

## 任务 5：调度按 due 监控项执行

**文件：**
- 修改：`src/worker/db/repositories/provider-configs.ts`
- 修改：`src/worker/providers/types.ts`
- 修改：`src/worker/jobs/run-health-check.ts`
- 修改：`src/worker/jobs/persist-check-results.ts`
- 测试：`test/worker/jobs/run-health-check.test.ts`
- 测试：`test/worker/jobs/persist-check-results.test.ts`

- [x] **步骤 1：写 due 逻辑测试**

在 `run-health-check.test.ts` 覆盖：

```ts
it("checks configs whose effective interval is due", async () => {});
it("skips configs whose last check is still within interval", async () => {});
it("uses site default interval when config override is null", async () => {});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/jobs/run-health-check.test.ts
```

预期：FAIL，原因是当前每次加载所有 enabled 配置。

- [x] **步骤 3：实现 due 配置加载**

`loadEnabledProviderConfigs` 查询时引入 `site_settings.default_check_interval_seconds`，计算 effective interval：

```sql
COALESCE(c.check_interval_seconds, s.default_check_interval_seconds) AS effective_check_interval_seconds
```

筛选：

```sql
c.enabled = 1
AND (c.last_checked_at_ms IS NULL OR c.last_checked_at_ms <= ? - effective_interval_ms)
```

- [x] **步骤 4：持久化 last_checked_at_ms**

`persistCheckResults` 在写 `check_latest` 时，同时更新 `check_configs.last_checked_at_ms = nowMs`。不要用失败跳过更新；失败也代表一次检查。

- [x] **步骤 5：运行调度测试**

运行：

```bash
pnpm vitest run test/worker/jobs/run-health-check.test.ts
pnpm vitest run test/worker/jobs/persist-check-results.test.ts
```

预期：PASS。

## 任务 6：飞书 Webhook 标准通知

**文件：**
- 创建：`src/worker/db/repositories/admin/notification-settings.ts`
- 创建：`src/worker/routes/admin/notification-settings.ts`
- 修改：`src/worker/routes/admin/index.ts`
- 创建：`src/worker/notifications/lark-webhook.ts`
- 创建：`src/worker/jobs/notification-events.ts`
- 修改：`src/worker/jobs/run-health-check.ts`
- 创建：`src/components/admin/notification-settings-view.tsx`
- 修改：`src/components/admin/admin-nav.tsx`
- 修改：`src/components/admin/admin-shell.tsx`
- 测试：`test/worker/routes/admin/notification-settings-route.test.ts`
- 测试：`test/worker/jobs/notification-events.test.ts`
- 测试：`test/components/admin/notification-settings-view.test.tsx`

- [x] **步骤 1：写通知规则测试**

`notification-events.test.ts` 覆盖：

```ts
it("sends degraded notification when status changes from operational to degraded", async () => {});
it("sends failed notification when status changes to failed", async () => {});
it("sends recovered notification when status changes back to operational", async () => {});
it("does not notify for maintenance", async () => {});
it("does not resend the same event type within cooldown", async () => {});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/jobs/notification-events.test.ts
```

预期：FAIL，模块不存在。

- [x] **步骤 3：实现飞书消息发送**

`src/worker/notifications/lark-webhook.ts`：

```ts
export interface LarkNotificationInput {
  webhookUrl: string;
  siteName: string;
  publicOrigin: string | null;
  channelName: string;
  model: string;
  status: "degraded" | "failed" | "recovered";
  latencyMs: number | null;
  message: string | null;
  checkedAt: string;
}

export async function sendLarkNotification(input: LarkNotificationInput): Promise<void> {
  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: { title: { tag: "plain_text", content: `${input.siteName} 状态通知` } },
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `**渠道**：${input.channelName}` } },
          { tag: "div", text: { tag: "lark_md", content: `**模型**：${input.model}` } },
          { tag: "div", text: { tag: "lark_md", content: `**状态**：${input.status}` } },
          { tag: "div", text: { tag: "lark_md", content: `**延迟**：${input.latencyMs ?? "—"} ms` } },
          { tag: "div", text: { tag: "lark_md", content: `**时间**：${input.checkedAt}` } },
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Lark webhook failed: ${response.status}`);
  }
}
```

- [x] **步骤 4：实现通知设置 API 和后台页面**

通知设置字段：启用、Webhook URL、延迟通知、异常通知、恢复通知。Webhook URL 使用 `CONFIG_ENCRYPTION_KEY` 加密后写入 D1，不回显明文，只返回 `hasWebhookUrl`。

- [x] **步骤 5：在 job 中触发通知**

`runHealthCheckJob` 在 `persistCheckResults` 后调用 `processNotificationEvents`。传入本轮 results、旧 latest 状态、site settings、notification settings。通知失败不应让健康检查整体失败；但必须在 `job_runs.errorMessage` 或通知事件 message 中记录失败摘要。

- [x] **步骤 6：运行通知测试**

运行：

```bash
pnpm vitest run test/worker/jobs/notification-events.test.ts
pnpm vitest run test/worker/routes/admin/notification-settings-route.test.ts
pnpm vitest run test/components/admin/notification-settings-view.test.tsx
```

预期：PASS。

## 任务 7：Dashboard snapshot 改为站点/渠道/模型结构

**文件：**
- 修改：`src/worker/jobs/write-dashboard-snapshot.ts`
- 修改：`lib/types/dashboard.ts`
- 测试：`test/worker/jobs/write-dashboard-snapshot.test.ts`

- [x] **步骤 1：写 snapshot 结构测试**

测试断言 payload 包含：

```ts
expect(payload.site).toMatchObject({
  siteName: "SU8 Status",
  logoUrl: "https://example.com/logo.png",
});
expect(payload.channels[0]).toMatchObject({
  name: "Claude 官方",
  models: [
    expect.objectContaining({ model: "Claude 3.5 Sonnet" }),
  ],
});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/jobs/write-dashboard-snapshot.test.ts
```

预期：FAIL，当前 payload 没有 `site` 和 `channels`。

- [x] **步骤 3：更新 DashboardData 类型**

新增：

```ts
export interface DashboardSiteInfo {
  siteName: string;
  statusTitle: string;
  description: string | null;
  logoUrl: string | null;
  publicOrigin: string | null;
}

export interface DashboardChannelGroup {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  enabled: boolean;
  models: ProviderTimeline[];
}
```

`DashboardData` 增加：

```ts
site: DashboardSiteInfo;
channels: DashboardChannelGroup[];
```

保留 `providerTimelines` 和 `groupInfos`，直到所有调用方迁移完成。

- [x] **步骤 4：更新 snapshot 写入**

`writeDashboardSnapshot` 查询 `site_settings`、`channels`，按 `channel_id` 组装 `channels[].models`，并继续填充兼容字段 `providerTimelines`。

- [x] **步骤 5：运行 snapshot 测试**

运行：

```bash
pnpm vitest run test/worker/jobs/write-dashboard-snapshot.test.ts
```

预期：PASS。

## 任务 8：前台状态页 UI

**文件：**
- 修改：`src/components/dashboard/dashboard-island.tsx`
- 测试：`test/components/dashboard-island.test.tsx`

- [x] **步骤 1：写前台失败测试**

覆盖：

```ts
it("renders site logo, site title, channel sections and model history rows", async () => {});
it("keeps dashboard ready marker for screenshot rendering", async () => {});
it("filters by channel and searches model names", async () => {});
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/components/dashboard-island.test.tsx
```

预期：FAIL，当前 UI 仍以 Provider 卡片为主。

- [x] **步骤 3：实现 UI**

实现组件结构：

```text
DashboardIsland
  Header(site)
  Toolbar(channel filter, search, period, refresh)
  ChannelSection[]
    ModelStatusRow[]
      StatusHistory
```

文案规则：页面用户关心状态，不展示“配置”“数据库”“Provider 配置”等后台词。

- [x] **步骤 4：保留截图 ready 标记**

根 section 保持：

```tsx
data-dashboard-ready={!isLoading && !errorMessage ? "true" : "false"}
```

- [x] **步骤 5：运行前台测试**

运行：

```bash
pnpm vitest run test/components/dashboard-island.test.tsx
```

预期：PASS。

## 任务 9：公开 JSON API 与截图 API 一致性

**文件：**
- 修改：`src/worker/routes/public-status.ts`
- 保持：`src/worker/routes/public-status-screenshot.ts`
- 测试：`test/worker/routes/public-route.test.ts`

- [x] **步骤 1：写公开 API 失败测试**

测试 `/api/public/status?period=7d` 输出全英文字段名：

```ts
expect(body.site).toMatchObject({
  name: "SU8 Status",
  title: "AI Model Status",
  logoUrl: "https://example.com/logo.png",
});
expect(body.channels[0]).toMatchObject({
  name: "Claude Official",
  models: [expect.objectContaining({ name: "Claude 3.5 Sonnet" })],
});
```

同时保留 screenshot 测试：

```ts
expect(browserState.calls.goto).toBe(
  "https://status.example.com/?period=7d&screenshot=1"
);
expect(browserState.calls.selector).toBe("[data-dashboard-ready='true']");
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/routes/public-route.test.ts
```

预期：公开 JSON 新结构测试失败，截图旧测试仍通过。

- [x] **步骤 3：更新 public payload builder**

`PublicStatusPayload` 输出全英文字段名。数据库和内部 dashboard snapshot 可以继续用 camelCase；公开 API 的 `site` 使用 `name/title/description/logoUrl/publicOrigin`：

```ts
{
  version: 2,
  site: {
    name,
    title,
    description,
    logoUrl,
    publicOrigin,
  },
  generatedAt,
  period,
  overallStatus,
  summary,
  channels: [
    {
      id,
      name,
      logoUrl,
      websiteUrl,
      statusPageUrl,
      overallStatus,
      models: [
        { id, name, type, status, latencyMs, checkedAt, message, availability }
      ]
    }
  ]
}
```

不要在公开 API 中输出中文字段名；`status` 值保持英文枚举：`operational`、`degraded`、`failed`、`maintenance`、`unknown`。

- [x] **步骤 4：运行公开路由测试**

运行：

```bash
pnpm vitest run test/worker/routes/public-route.test.ts
```

预期：PASS。

## 任务 10：运行状态、文案和文档收尾

**文件：**
- 修改：`src/components/admin/overview-view.tsx`
- 修改：`src/components/admin/runtime-view.tsx`
- 修改：`README.md`
- 修改：`.env.example`
- 修改：`docs/PUBLIC_STATUS_API.md`
- 测试：`test/components/admin/management-views.test.tsx`

- [x] **步骤 1：后台文案统一**

替换后台用户可见文案：

```text
分组 -> 渠道
Provider 配置 -> 监控项
通知 -> 通知设置
```

不要改数据库列名作为本任务目标，避免扩大迁移。

- [x] **步骤 2：文档更新**

`.env.example` 保留 `CONFIG_ENCRYPTION_KEY`、`ADMIN_TOKEN`、`PUBLIC_ORIGIN`，新增说明：飞书 Webhook 通过后台写入，不写 env。

`docs/PUBLIC_STATUS_API.md` 更新 v2 JSON 示例，包含 site/channels/models。

- [x] **步骤 3：运行管理台测试**

运行：

```bash
pnpm vitest run test/components/admin/management-views.test.tsx
```

预期：PASS。

## 任务 11：端到端验证与部署前检查

**文件：**
- 无新增源码修改

- [x] **步骤 1：运行单元和组件测试**

运行：

```bash
pnpm vitest run \
  test/migration/single-site-channel-monitoring.test.ts \
  test/worker/routes/admin/site-settings-route.test.ts \
  test/worker/routes/admin/channels-route.test.ts \
  test/worker/routes/admin/management-routes.test.ts \
  test/worker/routes/admin/notification-settings-route.test.ts \
  test/worker/jobs/run-health-check.test.ts \
  test/worker/jobs/persist-check-results.test.ts \
  test/worker/jobs/notification-events.test.ts \
  test/worker/jobs/write-dashboard-snapshot.test.ts \
  test/worker/routes/public-route.test.ts \
  test/components/admin/site-settings-view.test.tsx \
  test/components/admin/channels-view.test.tsx \
  test/components/admin/notification-settings-view.test.tsx \
  test/components/dashboard-island.test.tsx
```

预期：PASS。

- [x] **步骤 2：运行类型检查和构建**

运行：

```bash
pnpm typecheck
pnpm build
pnpm deploy:dry-run
```

预期：全部 PASS。

- [x] **步骤 3：本地 smoke**

运行：

```bash
pnpm dev
```

检查：

```text
http://127.0.0.1:8787/admin
http://127.0.0.1:8787/
http://127.0.0.1:8787/api/public/status?period=7d
http://127.0.0.1:8787/api/public/status-card.png?period=7d
```

预期：后台可配置站点、渠道、监控项、通知；前台/API/截图一致。

- [x] **步骤 4：生产迁移和部署**

在确认要部署时运行：

```bash
pnpm exec wrangler d1 migrations apply check-cx --remote
pnpm exec wrangler deploy
```

部署后用代理或可访问网络检查：

```bash
HTTPS_PROXY=http://127.0.0.1:7890 curl -I https://check-cx-workers.flowrise.workers.dev/
HTTPS_PROXY=http://127.0.0.1:7890 curl -I https://check-cx-workers.flowrise.workers.dev/api/public/status-card.png?period=7d
```

预期：首页 200，截图 PNG 200。

## 执行顺序建议

- 第一批：任务 1-4，完成数据模型和后台配置。
- 第二批：任务 5-7，完成调度、通知、snapshot。
- 第三批：任务 8-10，完成前台/API/截图和文档。
- 第四批：任务 11，完成验证与部署。

## 自检结果

- 规格覆盖：已覆盖单站点、Logo URL、渠道、模型监控、全局频次 + 单项覆盖、飞书通知、前台、公开 JSON、截图 PNG。
- 范围控制：未做多站点、文件上传、R2、通知规则引擎、值班路由。
- 类型一致性：核心命名使用 `site_settings`、`channels`、`check_configs.channel_id`、`check_interval_seconds`、`notification_settings`、`notification_events`。
- 兼容策略：公开 JSON 保持升级路径，截图 API 继续复用真实首页。
