import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface StatementSyncLike {
  all(): Array<Record<string, unknown>>;
  get(...values: unknown[]): Record<string, unknown> | undefined;
  run(...values: unknown[]): unknown;
}

interface DatabaseSyncLike {
  exec(query: string): void;
  prepare(query: string): StatementSyncLike;
}

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncLike;
};

const migrationPath = resolve(
  process.cwd(),
  "drizzle/migrations/0001_initial.sql"
);

const requiredTables = [
  "check_request_templates",
  "check_models",
  "check_configs",
  "check_history",
  "check_latest",
  "availability_rollups",
  "dashboard_snapshots",
  "group_info",
  "system_notifications",
  "official_status_snapshots",
  "job_locks",
  "job_runs",
];

const requiredIndexes = [
  "idx_check_history_config_checked_at",
  "idx_check_configs_group_name",
  "idx_dashboard_snapshots_key_period",
  "idx_job_locks_locked_until",
];

function createMigratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(migrationPath, "utf8"));
  return db;
}

describe("D1 initial migration", () => {
  it("creates all required tables and indexes", () => {
    const db = createMigratedDatabase();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name));
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => String(row.name));

    expect(tables).toEqual(expect.arrayContaining(requiredTables));
    expect(indexes).toEqual(expect.arrayContaining(requiredIndexes));
  });

  it("supports insert, upsert, select, and prune smoke operations", () => {
    const db = createMigratedDatabase();

    db.prepare(
      "INSERT INTO check_models (id, type, model, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
    ).run("model-1", "openai", "gpt-4o-mini", 1, 1);
    db.prepare(
      "INSERT INTO check_configs (id, name, type, model_id, endpoint, enabled, is_maintenance, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "config-1",
      "OpenAI",
      "openai",
      "model-1",
      "https://api.openai.com/v1/chat/completions",
      1,
      0,
      1,
      1
    );
    db.prepare(
      "INSERT INTO check_history (id, config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("history-old", "config-1", "operational", 100, 20, 1, "ok");
    db.prepare(
      "INSERT INTO check_history (id, config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("history-new", "config-1", "degraded", 7000, 25, 2, "slow");
    db.prepare(
      "INSERT INTO check_latest (config_id, status, latency_ms, ping_latency_ms, checked_at_ms, message, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(config_id) DO UPDATE SET status = excluded.status, latency_ms = excluded.latency_ms, ping_latency_ms = excluded.ping_latency_ms, checked_at_ms = excluded.checked_at_ms, message = excluded.message, updated_at_ms = excluded.updated_at_ms"
    ).run("config-1", "degraded", 7000, 25, 2, "slow", 2);
    db.prepare(
      "INSERT INTO dashboard_snapshots (snapshot_key, period, payload_json, etag, generated_at_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(snapshot_key, period) DO UPDATE SET payload_json = excluded.payload_json, etag = excluded.etag, generated_at_ms = excluded.generated_at_ms"
    ).run("dashboard", "7d", "{\"ok\":true}", "\"etag\"", 2);
    db.prepare("DELETE FROM check_history WHERE checked_at_ms < ?").run(2);

    const latest = db
      .prepare("SELECT status FROM check_latest WHERE config_id = ?")
      .get("config-1");
    const snapshot = db
      .prepare(
        "SELECT payload_json FROM dashboard_snapshots WHERE snapshot_key = ? AND period = ?"
      )
      .get("dashboard", "7d");
    const historyCount = db
      .prepare("SELECT COUNT(*) AS count FROM check_history")
      .get();

    expect(latest?.status).toBe("degraded");
    expect(snapshot?.payload_json).toBe("{\"ok\":true}");
    expect(historyCount?.count).toBe(1);
  });
});
