import { readFileSync } from "node:fs";

import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

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
