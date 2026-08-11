# 单平台分组渠道模型监控系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把当前系统从“多个中转站/渠道状态页”修正为“单个平台的多分组/可用区状态页”，每个分组内部展示渠道与模型监控状态；未配置分组时自动表现为一个默认分组。

**架构：** 站点仍然是唯一平台实体（例如 SU8.Codes），分组代表可用区、区域、线路、部署单元或业务分区；监控项绑定到 `group + channel + model`。Cron 产生的 dashboard snapshot 从 `channels -> models` 改为 `groups -> channels -> models`，前台、公开 JSON API、截图 API 使用同一份 v3 结构。

**技术栈：** Astro、React 19、Hono、Cloudflare Workers、D1、Drizzle schema、Cloudflare Browser Rendering、Tailwind CSS、Vitest、Testing Library、Wrangler。

---

## 1. 产品模型重定义

### 当前问题

当前实现把 `channels` 做成前台一级结构，视觉和信息架构像“多个中转站/渠道监控”。这不符合目标：我们只监控一个平台，不是多个站点。

当前实际还存在两个技术问题：

1. `Responses API` 兼容靠 endpoint 结尾推断，后台没有显式选择 API 格式，配置容易出错。
2. Cron 只加载 due configs；当某一分钟没有监控项到期时，旧实现可能用空 `results` 覆盖 dashboard snapshot，导致前台短暂出现“暂无匹配的健康检查快照”。

### 新模型

唯一站点：

```text
Platform / Site
└── Groups / Zones
    └── Channels
        └── Models / Monitors
```

含义：

- **站点（Platform/Site）**：唯一平台，例如 `SU8.Codes`，配置 logo、站点名、公开域名、说明、全局频次、通知冷却。
- **分组（Group/Zone）**：平台内部的可用区/区域/线路/环境。例：`CN2`、`Global`、`Azure East Asia`、`AWS us-east-1`。
- **渠道（Channel）**：该分组内的一类服务渠道或 API 供应通道。例：`Codex`、`Claude Official`、`AWS Bedrock Claude`。
- **模型（Model/Monitor）**：真实被检查的模型监控项，绑定到一个分组和一个渠道。

### 未配置分组时的行为

这是明确产品行为，不是 fallback：

- 如果后台没有创建任何分组，系统 SHALL 在 snapshot 中输出一个隐式默认分组。
- 默认分组展示名称为 `Default`，后台不显示这个记录。
- 所有未绑定分组的监控项都归入默认分组。
- 前台只有一个分组时，不需要强行展示复杂的分组 tab；可以直接展示该分组下的渠道与模型。

---

## 2. 最终用户体验

### 后台 Admin

后台配置顺序：

1. **站点设置**：站点名、logo、描述、公开域名、默认检查频次、通知冷却。
2. **分组/可用区**：名称、描述、位置/Region、排序、启用状态。
3. **渠道**：名称、logo、官网、官方状态页、排序、启用状态。
4. **模型**：Provider 类型、模型 ID、请求模板。
5. **监控项**：分组、渠道、模型、API 格式、Endpoint、API Key、频次、Region/备注、启用、维护中。
6. **通知设置**：飞书 Webhook、通知开关、异常/延迟/恢复通知。

### 前台 Status 页

顶部：

- 只表达单个平台：logo + `Status`。
- 总体状态来自所有启用分组内所有启用监控项。
- 统计展示：分组数、渠道数、模型数、最近更新、下次检查。

主体：

- 如果有多个分组：展示分组 tabs/cards，然后展示选中分组下的渠道与模型。
- 如果只有一个分组或没有配置分组：不突出“分组管理”，直接展示渠道与模型。
- 每个分组显示分组状态、模型数量、异常数量、最近更新时间。
- 每个渠道显示渠道 logo、状态、模型数量。
- 每个模型显示状态、延迟、可用率、最近 60 次检查格。

### 公开 API

`/api/public/status` 升级为 `version: 3`：

```json
{
  "version": 3,
  "site": {
    "siteName": "SU8.Codes",
    "statusTitle": "SU8.Codes Status",
    "logoUrl": "https://www.su8.codes/brand/logo-wide.png",
    "publicOrigin": "https://www.su8.codes"
  },
  "summary": {
    "status": "operational",
    "groups": 1,
    "channels": 1,
    "models": 1,
    "lastUpdated": "2026-06-08T00:00:00.000Z"
  },
  "groups": [
    {
      "id": "default",
      "name": "Default",
      "status": "operational",
      "channels": [
        {
          "id": "codex",
          "name": "Codex",
          "status": "operational",
          "models": [
            {
              "id": "monitor-1",
              "name": "GPT-5.5",
              "model": "gpt-5.5",
              "apiFormat": "responses",
              "status": "operational",
              "latencyMs": 1120,
              "availability": { "7d": 99.9 },
              "history": []
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 3. 文件结构

### 数据库与类型

- 创建：`drizzle/migrations/0003_grouped_platform_monitoring.sql`
  - 新增 `monitor_groups`
  - `check_configs` 新增 `group_id`、`api_format`
  - 迁移旧 `group_info` 数据到 `monitor_groups`
  - endpoint 以 `/responses` 结尾的旧监控项设置为 `api_format = 'responses'`
- 修改：`src/worker/db/schema.ts`
  - 新增 `monitorGroups`
  - `checkConfigs` 增加 `groupId`、`apiFormat`
- 修改：`src/worker/providers/types.ts`
  - 增加 `WorkerApiFormat = "chat_completions" | "responses"`
  - config/result 增加 `groupId/groupName/groupRegion/groupDescription` 和 `apiFormat`
- 修改：`lib/types/dashboard.ts`
  - 新增 `DashboardGroup`、`DashboardChannel`、`DashboardChannelModel`
  - `DashboardData` 使用 `groups` 作为主结构
  - 兼容字段只在迁移期保留，不作为前端主数据源

### 后台 Admin

- 创建：`src/worker/db/repositories/admin/monitor-groups.ts`
  - 分组 CRUD
- 创建：`src/worker/routes/admin/monitor-groups.ts`
  - `/api/admin/monitor-groups`
- 修改：`src/worker/db/repositories/admin/configs.ts`
  - 监控项绑定 `group_id`、`channel_id`、`api_format`
- 修改：`src/worker/routes/admin/configs.ts`
  - 校验 `groupId` 可为空
  - 校验 `apiFormat`
  - 保存 `api_format`
- 修改：`src/components/admin/admin-nav.tsx`
  - “分组”改名为“分组/可用区”
- 替换：`src/components/admin/groups-view.tsx`
  - 从 legacy `group_info` 切到 `monitor_groups`
- 修改：`src/components/admin/config-form.tsx`
  - 增加 API 格式选择
  - 增加分组选择，允许为空
  - 分组为空时提示“未配置分组时会归入默认分组”
- 修改：`src/components/admin/configs-view.tsx`
  - 列表展示分组、渠道、API 格式、模型、状态

### 运行时与快照

- 修改：`src/worker/db/repositories/provider-configs.ts`
  - 加载 due configs 时带出 group/channel/apiFormat 元数据
- 修改：`src/worker/providers/check-provider.ts`
  - `apiFormat === "responses"` 时使用 Responses 请求体与流式解析
  - `apiFormat === "chat_completions"` 时使用 Chat Completions 请求体
  - 不再通过 endpoint 后缀推断 API 格式
- 修改：`src/worker/jobs/run-health-check.ts`
  - 当 `results.length === 0` 时不写 dashboard snapshot
  - 保留上一次 dashboard snapshot，避免“暂无匹配”闪烁
- 修改：`src/worker/jobs/write-dashboard-snapshot.ts`
  - 输出 `groups -> channels -> models`
  - 如果没有 enabled groups，创建隐式 default group
  - 如果某个 config 没有 group_id，放入 default group
- 修改：`src/worker/routes/public-status.ts`
  - 输出 v3 groups 结构
  - 删除从 `providerTimelines` 反推 channels 的逻辑

### 前台 UI

- 修改：`src/components/dashboard/dashboard-island.tsx`
  - 数据主入口改为 `data.groups`
  - 多分组时显示分组切换
  - 单分组时隐藏分组切换，只展示渠道与模型
  - 空态只在“确实没有任何监控项”时出现
- 修改：`src/worker/routes/public-status-screenshot.ts` 如存在独立逻辑
  - 保持打开首页截图，不新建第二套 UI

---

## 4. 任务 1：数据库迁移与类型

**文件：**
- 创建：`drizzle/migrations/0003_grouped_platform_monitoring.sql`
- 修改：`src/worker/db/schema.ts`
- 修改：`src/worker/providers/types.ts`
- 修改：`lib/types/dashboard.ts`
- 测试：`test/migration/grouped-platform-monitoring.test.ts`

- [ ] **步骤 1：编写失败迁移测试**

创建 `test/migration/grouped-platform-monitoring.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";

function runSql(db: initSqlJs.Database, sql: string) {
  for (const statement of sql.split(";").map((item) => item.trim()).filter(Boolean)) {
    db.run(statement);
  }
}

describe("grouped platform monitoring migration", () => {
  it("adds monitor groups and explicit api format", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    runSql(db, readFileSync("drizzle/migrations/0001_initial.sql", "utf8"));
    runSql(db, readFileSync("drizzle/migrations/0002_single_site_channel_monitoring.sql", "utf8"));
    runSql(db, readFileSync("drizzle/migrations/0003_grouped_platform_monitoring.sql", "utf8"));

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0].values.flat();
    expect(tables).toContain("monitor_groups");

    const columns = db.exec("PRAGMA table_info(check_configs)")[0].values.map((row) => row[1]);
    expect(columns).toContain("group_id");
    expect(columns).toContain("api_format");
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/migration/grouped-platform-monitoring.test.ts
```

预期：FAIL，原因是 `0003_grouped_platform_monitoring.sql` 不存在。

- [ ] **步骤 3：创建迁移**

创建 `drizzle/migrations/0003_grouped_platform_monitoring.sql`：

```sql
CREATE TABLE IF NOT EXISTS monitor_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  region TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT OR IGNORE INTO monitor_groups (id, name, description, sort_order, enabled, created_at_ms, updated_at_ms)
SELECT id, group_name, tags, 0, 1, created_at_ms, updated_at_ms
FROM group_info;

ALTER TABLE check_configs ADD COLUMN group_id TEXT REFERENCES monitor_groups(id) ON DELETE SET NULL;
ALTER TABLE check_configs ADD COLUMN api_format TEXT NOT NULL DEFAULT 'chat_completions'
  CHECK (api_format IN ('chat_completions', 'responses'));

UPDATE check_configs
SET group_id = (
  SELECT monitor_groups.id FROM monitor_groups WHERE monitor_groups.name = check_configs.group_name
)
WHERE group_name IS NOT NULL;

UPDATE check_configs
SET api_format = 'responses'
WHERE endpoint LIKE '%/responses';

CREATE INDEX IF NOT EXISTS idx_check_configs_group_id ON check_configs(group_id);
```

- [ ] **步骤 4：更新 Drizzle schema**

修改 `src/worker/db/schema.ts`：

```ts
export const monitorGroups = sqliteTable("monitor_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  region: text("region"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});
```

并在 `checkConfigs` 增加：

```ts
groupId: text("group_id").references(() => monitorGroups.id, {
  onDelete: "set null",
}),
apiFormat: text("api_format").notNull().default("chat_completions"),
```

- [ ] **步骤 5：更新 dashboard 类型**

修改 `lib/types/dashboard.ts`，新增：

```ts
export interface DashboardGroup {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  status: HealthStatus | "unknown";
  channels: DashboardChannel[];
}

export interface DashboardData {
  site: DashboardSite | null;
  groups: DashboardGroup[];
  channels: DashboardChannel[];
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
  availabilityStats: Record<string, AvailabilityStat[]>;
  trendPeriod: AvailabilityPeriod;
  generatedAt: number;
}
```

- [ ] **步骤 6：运行迁移测试**

运行：

```bash
pnpm vitest run test/migration/grouped-platform-monitoring.test.ts
```

预期：PASS。

---

## 5. 任务 2：显式 API 格式选择

**文件：**
- 修改：`src/worker/providers/check-provider.ts`
- 修改：`src/worker/providers/types.ts`
- 修改：`src/worker/db/repositories/provider-configs.ts`
- 修改：`src/worker/db/repositories/admin/configs.ts`
- 修改：`src/worker/routes/admin/configs.ts`
- 修改：`src/components/admin/config-form.tsx`
- 测试：`test/worker/providers/check-provider.test.ts`
- 测试：`test/worker/routes/admin/management-routes.test.ts`

- [ ] **步骤 1：编写 provider 测试**

在 `test/worker/providers/check-provider.test.ts` 增加：

```ts
it("uses Responses request body when apiFormat is responses", async () => {
  const fetcher = vi.fn(async () =>
    textStreamResponse(['data: {"type":"response.output_text.delta","delta":"8"}\n\n'])
  );

  await checkProvider(
    {
      ...baseConfig,
      endpoint: "https://api.openai.com/v1/responses",
      apiFormat: "responses",
      model: "gpt-5.5",
    },
    { challenge, fetcher, measurePing: async () => null, now: () => 1_000 }
  );

  const [, init] = getFetchCall(fetcher);
  const body = JSON.parse(String(init.body));
  expect(body.input).toBe(challenge.prompt);
  expect(body.messages).toBeUndefined();
  expect(body.stream).toBe(true);
});

it("does not infer Responses from endpoint when apiFormat is chat_completions", async () => {
  const fetcher = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "8" } }] }));

  await checkProvider(
    {
      ...baseConfig,
      endpoint: "https://api.openai.com/v1/responses",
      apiFormat: "chat_completions",
    },
    { challenge, fetcher, measurePing: async () => null, now: () => 1_000 }
  );

  const [, init] = getFetchCall(fetcher);
  const body = JSON.parse(String(init.body));
  expect(body.messages).toEqual([{ role: "user", content: challenge.prompt }]);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm vitest run test/worker/providers/check-provider.test.ts
```

预期：FAIL，原因是 `apiFormat` 尚未生效。

- [ ] **步骤 3：实现 provider 显式格式**

修改 `src/worker/providers/types.ts`：

```ts
export type WorkerApiFormat = "chat_completions" | "responses";

export interface WorkerProviderConfig {
  apiFormat: WorkerApiFormat;
}
```

修改 `src/worker/providers/check-provider.ts`：

```ts
const isResponsesRequest = config.apiFormat === "responses";
```

`buildRequestBody` 中同样使用：

```ts
if (config.apiFormat === "responses") {
  return {
    ...metadata,
    model: modelId,
    input: challenge.prompt,
    max_output_tokens: 1,
    stream: true,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
  };
}
```

- [ ] **步骤 4：后台表单增加 API 格式**

修改 `src/components/admin/config-form.tsx`：

```tsx
<Field label="API 格式">
  <Select
    value={apiFormat}
    onChange={(event) => setApiFormat(event.target.value as AdminApiFormat)}
  >
    <option value="chat_completions">Chat Completions</option>
    <option value="responses">Responses</option>
  </Select>
</Field>
```

payload 增加：

```ts
apiFormat,
```

- [ ] **步骤 5：Admin API 读写 apiFormat**

修改 `src/worker/routes/admin/configs.ts`：

```ts
apiFormat: apiFormat(optionalString(body, "apiFormat") ?? "chat_completions"),
```

修改 `src/worker/db/repositories/admin/configs.ts` 的 create/update/list SQL，加入 `api_format`。

- [ ] **步骤 6：运行相关测试**

运行：

```bash
pnpm vitest run \
  test/worker/providers/check-provider.test.ts \
  test/worker/routes/admin/management-routes.test.ts \
  test/components/admin/management-views.test.tsx
```

预期：PASS。

---

## 6. 任务 3：分组/可用区后台

**文件：**
- 创建：`src/worker/db/repositories/admin/monitor-groups.ts`
- 创建：`src/worker/routes/admin/monitor-groups.ts`
- 修改：`src/worker/routes/admin/index.ts`
- 修改：`src/components/admin/admin-api.ts`
- 修改：`src/components/admin/admin-types.ts`
- 创建/替换：`src/components/admin/groups-view.tsx`
- 测试：`test/worker/routes/admin/monitor-groups-route.test.ts`
- 测试：`test/components/admin/groups-view.test.tsx`

- [ ] **步骤 1：编写 route 测试**

创建 `test/worker/routes/admin/monitor-groups-route.test.ts`：

```ts
it("creates and lists monitor groups ordered by sort order", async () => {
  const env = await createAdminTestEnv();
  const headers = await loginHeaders(env);

  const created = await app.request("/api/admin/monitor-groups", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "CN2",
      description: "China CN2 availability zone",
      region: "cn2",
      sortOrder: 10,
      enabled: true,
    }),
  }, env);

  expect(created.status).toBe(201);
  const list = await app.request("/api/admin/monitor-groups", { headers }, env);
  const body = await list.json();
  expect(body[0]).toMatchObject({ name: "CN2", region: "cn2" });
});
```

- [ ] **步骤 2：实现 repository 与 route**

`src/worker/db/repositories/admin/monitor-groups.ts` 提供：

```ts
create(input)
list()
update(id, input)
usedByConfigs(id)
delete(id)
```

`src/worker/routes/admin/monitor-groups.ts` 提供：

```text
GET    /api/admin/monitor-groups
POST   /api/admin/monitor-groups
PUT    /api/admin/monitor-groups/:id
DELETE /api/admin/monitor-groups/:id
```

删除分组时：

- 如果被监控项使用，返回 `409`。
- 不自动把监控项挪到默认分组，避免隐式改数据。

- [ ] **步骤 3：实现前端列表**

`src/components/admin/groups-view.tsx` 使用表格列：

```text
名称 | Region | 描述 | 排序 | 状态 | 操作
```

空态文案：

```text
还没有分组
不创建分组时，状态页会按一个默认分组展示所有监控项。
```

- [ ] **步骤 4：运行测试**

运行：

```bash
pnpm vitest run \
  test/worker/routes/admin/monitor-groups-route.test.ts \
  test/components/admin/groups-view.test.tsx
```

预期：PASS。

---

## 7. 任务 4：监控项绑定分组 + 渠道 + 模型

**文件：**
- 修改：`src/worker/db/repositories/admin/configs.ts`
- 修改：`src/worker/routes/admin/configs.ts`
- 修改：`src/components/admin/config-form.tsx`
- 修改：`src/components/admin/configs-view.tsx`
- 修改：`src/worker/db/repositories/provider-configs.ts`
- 测试：`test/worker/db/provider-configs.test.ts`
- 测试：`test/components/admin/management-views.test.tsx`

- [ ] **步骤 1：更新 provider config 加载测试**

在 `test/worker/db/provider-configs.test.ts` 断言：

```ts
expect(configs[0]).toMatchObject({
  groupId: "group-cn2",
  groupName: "CN2",
  groupRegion: "cn2",
  channelId: "channel-codex",
  channelName: "Codex",
  apiFormat: "responses",
});
```

- [ ] **步骤 2：更新 SQL 加载**

`src/worker/db/repositories/provider-configs.ts` 查询：

```sql
LEFT JOIN monitor_groups g ON g.id = c.group_id
LEFT JOIN channels ch ON ch.id = c.channel_id
```

SELECT 增加：

```sql
c.group_id,
g.name AS group_name,
g.description AS group_description,
g.region AS group_region,
c.api_format,
c.channel_id,
ch.name AS channel_name,
ch.logo_url AS channel_logo_url
```

- [ ] **步骤 3：后台表单**

监控项表单字段顺序：

```text
配置名称
Provider 类型 / 模型
分组（可为空） / 渠道
API 格式 / API 端点
API Key
检查频次 / Region 备注
启用 / 维护中
```

分组为空提示：

```text
不选择分组时，会显示在默认分组中。
```

- [ ] **步骤 4：运行测试**

运行：

```bash
pnpm vitest run \
  test/worker/db/provider-configs.test.ts \
  test/components/admin/management-views.test.tsx
```

预期：PASS。

---

## 8. 任务 5：Snapshot 改成 groups → channels → models

**文件：**
- 修改：`src/worker/jobs/write-dashboard-snapshot.ts`
- 修改：`src/worker/jobs/run-health-check.ts`
- 测试：`test/worker/jobs/write-dashboard-snapshot.test.ts`
- 测试：`test/worker/jobs/run-health-check.test.ts`

- [ ] **步骤 1：写 snapshot 测试**

在 `test/worker/jobs/write-dashboard-snapshot.test.ts` 增加：

```ts
it("writes grouped dashboard snapshots", async () => {
  const payload = await writeAndReadDashboardPayload({
    groups: [{ id: "group-cn2", name: "CN2", region: "cn2" }],
    channels: [{ id: "channel-codex", name: "Codex" }],
    results: [{ id: "config-1", groupId: "group-cn2", channelId: "channel-codex", name: "GPT-5.5" }],
  });

  expect(payload.groups[0]).toMatchObject({
    id: "group-cn2",
    name: "CN2",
    channels: [
      expect.objectContaining({
        id: "channel-codex",
        models: [expect.objectContaining({ name: "GPT-5.5" })],
      }),
    ],
  });
});
```

再增加默认分组测试：

```ts
it("uses an implicit default group when no groups are configured", async () => {
  const payload = await writeAndReadDashboardPayload({
    groups: [],
    channels: [{ id: "channel-codex", name: "Codex" }],
    results: [{ id: "config-1", groupId: null, channelId: "channel-codex", name: "GPT-5.5" }],
  });

  expect(payload.groups).toHaveLength(1);
  expect(payload.groups[0]).toMatchObject({ id: "default", name: "Default" });
});
```

- [ ] **步骤 2：实现分组组装**

`write-dashboard-snapshot.ts` 增加：

```ts
function buildGroups(results, groupRows, channelRows, historyByConfig, availabilityStats, officialStatusByType) {
  const hasConfiguredGroups = groupRows.length > 0;
  const groupById = new Map(groupRows.map(toDashboardGroup));

  if (!hasConfiguredGroups) {
    groupById.set("default", createDefaultGroup());
  }

  for (const result of results) {
    const groupId = result.groupId ?? "default";
    const group = groupById.get(groupId) ?? groupById.get("default");
    if (!group) continue;
    appendResultToGroupChannel(group, result);
  }

  return [...groupById.values()].filter((group) => group.channels.length > 0);
}
```

- [ ] **步骤 3：修复空快照覆盖**

`src/worker/jobs/run-health-check.ts`：

```ts
if (results.length > 0) {
  await writeDashboardSnapshot(env.DB, results, snapshotAtMs);
}
```

新增测试：

```ts
it("does not overwrite dashboard snapshots when no configs are due", async () => {
  await runHealthCheckJob(env, now, { loadConfigs: async () => [] });
  expect(db.dashboardSnapshotWrites).toBe(0);
});
```

- [ ] **步骤 4：运行测试**

运行：

```bash
pnpm vitest run \
  test/worker/jobs/write-dashboard-snapshot.test.ts \
  test/worker/jobs/run-health-check.test.ts
```

预期：PASS。

---

## 9. 任务 6：前台 UI 改成分组视角

**文件：**
- 修改：`src/components/dashboard/dashboard-island.tsx`
- 测试：`test/components/dashboard-island.test.tsx`

- [ ] **步骤 1：写多分组展示测试**

```ts
it("renders groups before channels when multiple groups exist", async () => {
  renderDashboard({
    groups: [
      { id: "cn2", name: "CN2", channels: [codexChannel] },
      { id: "global", name: "Global", channels: [codexChannel] },
    ],
  });

  expect(screen.getByRole("button", { name: "CN2" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Global" })).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Codex" })).not.toBeNull();
});
```

- [ ] **步骤 2：写单分组隐藏测试**

```ts
it("does not show group switcher for a single implicit group", async () => {
  renderDashboard({
    groups: [{ id: "default", name: "Default", channels: [codexChannel] }],
  });

  expect(screen.queryByRole("button", { name: "Default" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Codex" })).not.toBeNull();
});
```

- [ ] **步骤 3：实现 UI**

核心状态：

```ts
const groups = data?.groups ?? [];
const showGroupSwitcher = groups.length > 1;
const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
const channels = activeGroup?.channels ?? [];
```

空态条件：

```ts
const hasAnyMonitor = groups.some((group) =>
  group.channels.some((channel) => channel.models.length > 0)
);
```

只有 `hasAnyMonitor === false` 才显示“暂无监控项”。

- [ ] **步骤 4：运行测试**

运行：

```bash
pnpm vitest run test/components/dashboard-island.test.tsx
```

预期：PASS。

---

## 10. 任务 7：公开 API v3 与截图

**文件：**
- 修改：`src/worker/routes/public-status.ts`
- 修改：`docs/PUBLIC_STATUS_API.md`
- 测试：`test/worker/routes/public-route.test.ts`

- [ ] **步骤 1：写 public API 测试**

```ts
it("returns v3 grouped public status", async () => {
  const response = await app.request("/api/public/status?period=7d", {}, env);
  const body = await response.json();

  expect(body.version).toBe(3);
  expect(body.groups[0].channels[0].models[0]).toMatchObject({
    name: "GPT-5.5",
    apiFormat: "responses",
  });
});
```

- [ ] **步骤 2：实现 v3 输出**

`public-status.ts` 只从 snapshot `groups` 读取：

```ts
return c.json({
  version: 3,
  generatedAt: snapshot.generatedAt,
  site: snapshot.site,
  summary: summarizeGroups(snapshot.groups),
  groups: snapshot.groups,
});
```

删除从 `providerTimelines` 反推 channels 的逻辑。

- [ ] **步骤 3：更新文档**

`docs/PUBLIC_STATUS_API.md` 写明：

- v3 为 `site -> groups -> channels -> models`
- 未配置分组时返回 `groups[0].id = "default"`
- 截图 API 与首页共用 UI

- [ ] **步骤 4：运行测试**

运行：

```bash
pnpm vitest run test/worker/routes/public-route.test.ts
```

预期：PASS。

---

## 11. 任务 8：线上数据迁移与验证

**文件：**
- 修改：无新增代码，执行远程迁移与配置校验。

- [ ] **步骤 1：本地全量验证**

运行：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm deploy:dry-run
```

预期：全部 PASS。

- [ ] **步骤 2：应用远程 D1 迁移**

运行：

```bash
pnpm exec wrangler d1 migrations apply check-cx --remote
```

预期：`0003_grouped_platform_monitoring.sql` 成功应用。

- [ ] **步骤 3：修正线上现有监控项**

运行：

```bash
pnpm exec wrangler d1 execute check-cx --remote --command "
UPDATE check_configs
SET api_format = 'responses'
WHERE endpoint LIKE '%/responses';
"
```

- [ ] **步骤 4：部署 Worker**

运行：

```bash
pnpm exec wrangler deploy
```

- [ ] **步骤 5：等待 Cron 并验证 snapshot**

运行：

```bash
sleep 75
pnpm exec wrangler d1 execute check-cx --remote --command "
SELECT
  json_array_length(json_extract(payload_json, '$.groups')) AS group_count,
  json_extract(payload_json, '$.groups[0].channels[0].models[0].name') AS model_name
FROM dashboard_snapshots
WHERE snapshot_key='dashboard' AND period='7d';
"
```

预期：

```text
group_count >= 1
model_name = GPT-5.5
```

- [ ] **步骤 6：浏览器验证**

打开：

```text
https://check-cx-workers.flowrise.workers.dev/
https://check-cx-workers.flowrise.workers.dev/admin/
https://check-cx-workers.flowrise.workers.dev/api/public/status?period=7d
```

预期：

- 首页不再出现短暂“暂无匹配的健康检查快照”。
- 单分组时直接显示渠道和模型。
- 多分组时显示分组切换。
- Admin 监控项可以显式选择 `Chat Completions` 或 `Responses`。
- Public API 返回 `version: 3`。

---

## 12. 不做事项

- 不做多站点。
- 不把渠道当成一级站点。
- 不增加未确认的自动 endpoint 拼接逻辑。
- 不用 `providerTimelines` 继续反推新版前台结构。
- 不做复杂通知规则引擎。
- 不自动删除 legacy `group_info` 表；迁移完成后可保留只读，避免破坏旧数据。

---

## 13. 自检结果

- 规格覆盖：已覆盖单平台、分组/可用区、渠道、模型、显式 API 格式、无分组默认行为、空快照问题、公开 API、截图共用首页。
- 占位符扫描：没有“待定/后续实现/类似任务”等不可执行占位。
- 类型一致性：核心命名统一为 `monitor_groups`、`group_id`、`api_format`、`groups -> channels -> models`。
- 风险点：这是结构性调整，建议用子代理分任务实现，并在每个任务后跑对应测试。
