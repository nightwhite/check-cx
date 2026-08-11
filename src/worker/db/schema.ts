import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const nowMs = sql`(unixepoch() * 1000)`;

export const checkRequestTemplates = sqliteTable("check_request_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  requestHeaderJson: text("request_header_json"),
  metadataJson: text("metadata_json"),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const checkModels = sqliteTable("check_models", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  model: text("model").notNull(),
  templateId: text("template_id").references(() => checkRequestTemplates.id, {
    onDelete: "set null",
  }),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey().default("default"),
  siteName: text("site_name").notNull().default("Check CX"),
  statusTitle: text("status_title").notNull().default("AI Model Status"),
  description: text("description"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  publicOrigin: text("public_origin"),
  defaultCheckIntervalSeconds: integer("default_check_interval_seconds")
    .notNull()
    .default(60),
  notificationCooldownSeconds: integer("notification_cooldown_seconds")
    .notNull()
    .default(300),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  statusPageUrl: text("status_page_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const checkConfigs = sqliteTable(
  "check_configs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    modelId: text("model_id")
      .notNull()
      .references(() => checkModels.id, { onDelete: "restrict" }),
    channelId: text("channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),
    endpoint: text("endpoint").notNull(),
    apiFormat: text("api_format").notNull().default("chat_completions"),
    apiKeyCiphertext: text("api_key_ciphertext"),
    apiKeyNonce: text("api_key_nonce"),
    apiKeyVersion: integer("api_key_version").notNull().default(1),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    isMaintenance: integer("is_maintenance", { mode: "boolean" })
      .notNull()
      .default(false),
    groupName: text("group_name"),
    checkIntervalSeconds: integer("check_interval_seconds"),
    lastCheckedAtMs: integer("last_checked_at_ms"),
    region: text("region"),
    createdAtMs: integer("created_at_ms").notNull().default(nowMs),
    updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
  },
  (table) => [
    index("idx_check_configs_group_name").on(table.groupName),
    index("idx_check_configs_channel_id").on(table.channelId),
    index("idx_check_configs_due").on(table.enabled, table.lastCheckedAtMs),
  ]
);

export const checkHistory = sqliteTable(
  "check_history",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => checkConfigs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    latencyMs: integer("latency_ms"),
    pingLatencyMs: integer("ping_latency_ms"),
    checkedAtMs: integer("checked_at_ms").notNull(),
    message: text("message"),
    logMessage: text("log_message"),
    officialStatusJson: text("official_status_json"),
  },
  (table) => [
    index("idx_check_history_config_checked_at").on(
      table.configId,
      table.checkedAtMs
    ),
    index("idx_check_history_checked_at").on(table.checkedAtMs),
  ]
);

export const checkLatest = sqliteTable("check_latest", {
  configId: text("config_id")
    .primaryKey()
    .references(() => checkConfigs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  pingLatencyMs: integer("ping_latency_ms"),
  checkedAtMs: integer("checked_at_ms").notNull(),
  message: text("message"),
  logMessage: text("log_message"),
  officialStatusJson: text("official_status_json"),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const availabilityRollups = sqliteTable(
  "availability_rollups",
  {
    configId: text("config_id")
      .notNull()
      .references(() => checkConfigs.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    dayStartMs: integer("day_start_ms").notNull(),
    totalChecks: integer("total_checks").notNull().default(0),
    operationalCount: integer("operational_count").notNull().default(0),
    updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
  },
  (table) => [primaryKey({ columns: [table.configId, table.period, table.dayStartMs] })]
);

export const dashboardSnapshots = sqliteTable(
  "dashboard_snapshots",
  {
    snapshotKey: text("snapshot_key").notNull(),
    period: text("period").notNull(),
    payloadJson: text("payload_json").notNull(),
    etag: text("etag").notNull(),
    generatedAtMs: integer("generated_at_ms").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotKey, table.period] }),
    index("idx_dashboard_snapshots_key_period").on(
      table.snapshotKey,
      table.period
    ),
  ]
);

export const groupInfo = sqliteTable("group_info", {
  id: text("id").primaryKey(),
  groupName: text("group_name").notNull().unique(),
  websiteUrl: text("website_url"),
  tags: text("tags"),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const systemNotifications = sqliteTable("system_notifications", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  level: text("level").notNull().default("info"),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
});

export const notificationSettings = sqliteTable("notification_settings", {
  id: text("id").primaryKey().default("default"),
  larkWebhookCiphertext: text("lark_webhook_ciphertext"),
  larkWebhookNonce: text("lark_webhook_nonce"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  notifyDegraded: integer("notify_degraded", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyFailed: integer("notify_failed", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyRecovered: integer("notify_recovered", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
});

export const notificationEvents = sqliteTable(
  "notification_events",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => checkConfigs.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    sentAtMs: integer("sent_at_ms").notNull(),
    message: text("message"),
    createdAtMs: integer("created_at_ms").notNull().default(nowMs),
  },
  (table) => [
    index("idx_notification_events_config_type_sent").on(
      table.configId,
      table.eventType,
      table.sentAtMs
    ),
  ]
);

export const officialStatusSnapshots = sqliteTable("official_status_snapshots", {
  provider: text("provider").primaryKey(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  affectedComponentsJson: text("affected_components_json"),
  checkedAtMs: integer("checked_at_ms").notNull(),
});

export const jobLocks = sqliteTable(
  "job_locks",
  {
    jobName: text("job_name").primaryKey(),
    ownerId: text("owner_id").notNull(),
    lockedUntilMs: integer("locked_until_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull().default(nowMs),
  },
  (table) => [index("idx_job_locks_locked_until").on(table.lockedUntilMs)]
);

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull(),
    startedAtMs: integer("started_at_ms").notNull(),
    finishedAtMs: integer("finished_at_ms"),
    checkedCount: integer("checked_count").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (table) => [index("idx_job_runs_started_at").on(table.startedAtMs)]
);
