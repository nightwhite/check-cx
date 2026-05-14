import { describe, expect, it } from "vitest";

import { writeDashboardSnapshot } from "../../../src/worker/jobs/write-dashboard-snapshot";
import type { D1Executor, D1StatementLike } from "../../../src/worker/db/repositories";
import type { WorkerCheckResult } from "../../../src/worker/providers";

interface SnapshotRow {
  payload_json: string;
  generated_at_ms: number;
}

interface GroupInfoRow {
  group_name: string;
  website_url: string | null;
  tags: string | null;
}

interface AvailabilityRow {
  config_id: string;
  period: string;
  day_start_ms: number;
  total_checks: number;
  operational_count: number;
}

interface OfficialStatusRow {
  provider: string;
  status: string;
  message: string;
  affected_components_json: string | null;
  checked_at_ms: number;
}

class FakeStatement implements D1StatementLike {
  constructor(
    private readonly db: FakeD1,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    this.db.maxBindCount = Math.max(this.db.maxBindCount, values.length);
    if (values.length > 999) {
      throw new Error(`too many D1 bind parameters: ${values.length}`);
    }
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    return (this.db.rows.get(key) ?? null) as T | null;
  }

  async all<T>() {
    if (this.query.includes("FROM check_history")) {
      this.db.historyQueryCount++;
      this.db.lastHistoryQuery = this.query;
      return { results: this.db.historyRows as T[] };
    }

    if (this.query.includes("FROM availability_rollups")) {
      const ids = new Set(
        this.values.filter((value): value is string => typeof value === "string")
      );
      const numericValues = this.values.filter(
        (value): value is number => typeof value === "number"
      );
      const [upperBoundMs, cutoff7dMs, cutoff15dMs, cutoff30dMs] =
        numericValues.slice(-4);
      const cutoffByPeriod: Record<string, number> = {
        "7d": cutoff7dMs,
        "15d": cutoff15dMs,
        "30d": cutoff30dMs,
      };
      const groupedRows = new Map<string, AvailabilityRow>();

      for (const row of this.db.availabilityRows) {
        if (!ids.has(row.config_id)) {
          continue;
        }
        if (row.day_start_ms > upperBoundMs) {
          continue;
        }
        if (row.day_start_ms < cutoffByPeriod[row.period]) {
          continue;
        }

        const key = `${row.config_id}:${row.period}`;
        const existing = groupedRows.get(key) ?? {
          ...row,
          total_checks: 0,
          operational_count: 0,
        };
        existing.total_checks += row.total_checks;
        existing.operational_count += row.operational_count;
        groupedRows.set(key, existing);
      }

      return { results: [...groupedRows.values()] as T[] };
    }

    if (this.query.includes("FROM official_status_snapshots")) {
      return { results: this.db.officialStatusRows as T[] };
    }

    return { results: this.db.groupInfos as T[] };
  }

  async run() {
    if (
      this.query.startsWith("DELETE FROM dashboard_snapshots") &&
      this.query.includes("snapshot_key LIKE 'group:%'")
    ) {
      const generatedAtMs = Number(this.values[0]);
      let changes = 0;
      for (const [key, row] of this.db.rows) {
        if (
          key.startsWith("group:") &&
          row.generated_at_ms < generatedAtMs
        ) {
          this.db.rows.delete(key);
          changes++;
        }
      }
      return { meta: { changes } };
    }

    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    this.db.rows.set(key, {
      payload_json: String(this.values[2]),
      generated_at_ms: Number(this.values[4]),
    });
    return { meta: { changes: 1 } };
  }
}

class FakeD1 implements D1Executor {
  readonly rows = new Map<string, SnapshotRow>();
  historyQueryCount = 0;
  batchCalls = 0;
  maxBindCount = 0;
  lastHistoryQuery = "";
  readonly historyRows = [
    {
      config_id: "core-1",
      name: "core-1",
      type: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      group_name: "core",
      status: "degraded",
      latency_ms: 700,
      ping_latency_ms: 70,
      checked_at_ms: Date.parse("2026-04-13T00:00:00.000Z"),
      message: "old degraded",
      log_message: null,
    },
    {
      config_id: "core-1",
      name: "core-1",
      type: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      group_name: "core",
      status: "failed",
      latency_ms: 900,
      ping_latency_ms: 90,
      checked_at_ms: Date.parse("2026-05-01T00:00:00.000Z"),
      message: "failed",
      log_message: null,
    },
    {
      config_id: "core-1",
      name: "core-1",
      type: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      group_name: "core",
      status: "operational",
      latency_ms: 100,
      ping_latency_ms: 10,
      checked_at_ms: Date.parse("2026-05-02T00:00:00.000Z"),
      message: "OK",
      log_message: null,
    },
  ];
  readonly groupInfos: GroupInfoRow[] = [
    {
      group_name: "core",
      website_url: "https://core.example",
      tags: "prod,core",
    },
  ];
  readonly availabilityRows: AvailabilityRow[] = [
    {
      config_id: "core-1",
      period: "7d",
      day_start_ms: Date.parse("2026-05-01T00:00:00.000Z"),
      total_checks: 3,
      operational_count: 2,
    },
    {
      config_id: "core-1",
      period: "7d",
      day_start_ms: Date.parse("2026-05-02T00:00:00.000Z"),
      total_checks: 7,
      operational_count: 7,
    },
    {
      config_id: "core-1",
      period: "7d",
      day_start_ms: Date.parse("2026-04-20T00:00:00.000Z"),
      total_checks: 100,
      operational_count: 0,
    },
    {
      config_id: "core-1",
      period: "30d",
      day_start_ms: Date.parse("2026-04-20T00:00:00.000Z"),
      total_checks: 30,
      operational_count: 27,
    },
    {
      config_id: "solo-1",
      period: "7d",
      day_start_ms: Date.parse("2026-05-02T00:00:00.000Z"),
      total_checks: 5,
      operational_count: 5,
    },
  ];
  readonly officialStatusRows: OfficialStatusRow[] = [
    {
      provider: "openai",
      status: "degraded",
      message: "OpenAI incident",
      affected_components_json: "[\"API\"]",
      checked_at_ms: Date.parse("2026-05-02T00:00:00.000Z"),
    },
  ];

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch(statements: D1StatementLike[]) {
    this.batchCalls++;
    for (const statement of statements) {
      await statement.run();
    }
    return [];
  }
}

function createResult(id: string, groupName: string | null): WorkerCheckResult {
  return {
    id,
    name: id,
    type: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    status: "operational",
    latencyMs: 100,
    pingLatencyMs: 10,
    checkedAt: "2026-05-02T00:00:00.000Z",
    message: "OK",
    groupName,
  };
}

describe("writeDashboardSnapshot", () => {
  it("writes dashboard and group snapshots for every period", async () => {
    const db = new FakeD1();

    await expect(
      writeDashboardSnapshot(
        db,
        [createResult("core-1", "core"), createResult("solo-1", null)],
        Date.parse("2026-05-03T00:00:00.000Z")
      )
    ).resolves.toEqual({ writtenSnapshots: 9 });

    expect(db.historyQueryCount).toBe(1);
    expect(db.batchCalls).toBe(1);
    expect(db.rows.has("dashboard:7d")).toBe(true);
    expect(db.rows.has("group:core:7d")).toBe(true);
    expect(db.rows.has("group:__ungrouped__:7d")).toBe(true);
    const groupPayload = JSON.parse(
      db.rows.get("group:core:7d")?.payload_json ?? "{}"
    );
    expect(groupPayload).toEqual(
      expect.objectContaining({
        groupName: "core",
        displayName: "core",
        tags: "prod,core",
        websiteUrl: "https://core.example",
        total: 1,
      })
    );
    expect(groupPayload.groupInfos).toBeUndefined();

    const dashboardPayload = JSON.parse(
      db.rows.get("dashboard:7d")?.payload_json ?? "{}"
    );
    const coreTimeline = dashboardPayload.providerTimelines.find(
      (timeline: { id: string }) => timeline.id === "core-1"
    );
    expect(dashboardPayload.groupInfos).toEqual([
      {
        groupName: "core",
        websiteUrl: "https://core.example",
        tags: "prod,core",
      },
    ]);
    expect(dashboardPayload.availabilityStats["core-1"]).toEqual([
      {
        period: "7d",
        totalChecks: 10,
        operationalCount: 9,
        availabilityPct: 90,
      },
      {
        period: "30d",
        totalChecks: 30,
        operationalCount: 27,
        availabilityPct: 90,
      },
    ]);
    expect(coreTimeline.latest.officialStatus).toEqual({
      status: "degraded",
      message: "OpenAI incident",
      affectedComponents: ["API"],
      checkedAt: "2026-05-02T00:00:00.000Z",
    });
    expect(coreTimeline.items.map((item: { status: string }) => item.status)).toEqual([
      "operational",
      "failed",
    ]);
    expect(coreTimeline.items[0].checkedAt).toBe("2026-05-02T00:00:00.000Z");

    const dashboard30dPayload = JSON.parse(
      db.rows.get("dashboard:30d")?.payload_json ?? "{}"
    );
    const core30dTimeline = dashboard30dPayload.providerTimelines.find(
      (timeline: { id: string }) => timeline.id === "core-1"
    );
    expect(core30dTimeline.items.map((item: { status: string }) => item.status)).toEqual([
      "operational",
      "failed",
      "degraded",
    ]);
    expect(groupPayload.availabilityStats).toEqual({
      "core-1": [
        {
          period: "7d",
          totalChecks: 10,
          operationalCount: 9,
          availabilityPct: 90,
        },
        {
          period: "30d",
          totalChecks: 30,
          operationalCount: 27,
          availabilityPct: 90,
        },
      ],
    });
    const ungroupedPayload = JSON.parse(
      db.rows.get("group:__ungrouped__:7d")?.payload_json ?? "{}"
    );
    expect(ungroupedPayload).toMatchObject({
      groupName: "__ungrouped__",
      displayName: "未分组",
      total: 1,
      providerTimelines: [
        expect.objectContaining({
          id: "solo-1",
        }),
      ],
    });
  });

  it("chunks history queries to stay under the D1 bind parameter limit", async () => {
    const db = new FakeD1();
    const results = Array.from({ length: 1_000 }, (_, index) =>
      createResult(`config-${index}`, null)
    );

    await expect(
      writeDashboardSnapshot(
        db,
        results,
        Date.parse("2026-05-03T00:00:00.000Z")
      )
    ).resolves.toEqual({ writtenSnapshots: 6 });

    expect(db.historyQueryCount).toBeGreaterThan(1);
    expect(db.maxBindCount).toBeLessThanOrEqual(100);
    expect(db.lastHistoryQuery).toContain("ROW_NUMBER()");
  });

  it("removes stale group snapshots after writing current group snapshots", async () => {
    const db = new FakeD1();
    db.rows.set("group:stale:7d", {
      payload_json: "{\"groupName\":\"stale\"}",
      generated_at_ms: 100,
    });
    db.rows.set("dashboard:7d", {
      payload_json: "{\"total\":0}",
      generated_at_ms: 100,
    });

    await expect(
      writeDashboardSnapshot(
        db,
        [createResult("core-1", "core")],
        Date.parse("2026-05-03T00:00:00.000Z")
      )
    ).resolves.toEqual({ writtenSnapshots: 6 });

    expect(db.rows.has("group:core:7d")).toBe(true);
    expect(db.rows.has("group:stale:7d")).toBe(false);
    expect(db.rows.has("dashboard:7d")).toBe(true);
  });
});
