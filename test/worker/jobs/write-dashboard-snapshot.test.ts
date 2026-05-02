import { describe, expect, it } from "vitest";

import { writeDashboardSnapshot } from "../../../src/worker/jobs/write-dashboard-snapshot";
import type { D1Executor, D1StatementLike } from "../../../src/worker/db/repositories";
import type { WorkerCheckResult } from "../../../src/worker/providers";

interface SnapshotRow {
  payload_json: string;
}

interface GroupInfoRow {
  group_name: string;
  website_url: string | null;
  tags: string | null;
}

class FakeStatement implements D1StatementLike {
  constructor(
    private readonly db: FakeD1,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    return (this.db.rows.get(key) ?? null) as T | null;
  }

  async all<T>() {
    if (this.query.includes("FROM check_history")) {
      this.db.historyQueryCount++;
      return { results: this.db.historyRows as T[] };
    }

    return { results: this.db.groupInfos as T[] };
  }

  async run() {
    const key = `${String(this.values[0])}:${String(this.values[1])}`;
    this.db.rows.set(key, {
      payload_json: String(this.values[2]),
    });
    return { meta: { changes: 1 } };
  }
}

class FakeD1 implements D1Executor {
  readonly rows = new Map<string, SnapshotRow>();
  historyQueryCount = 0;
  batchCalls = 0;
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
    ).resolves.toEqual({ writtenSnapshots: 6 });

    expect(db.historyQueryCount).toBe(1);
    expect(db.batchCalls).toBe(1);
    expect(db.rows.has("dashboard:7d")).toBe(true);
    expect(db.rows.has("group:core:7d")).toBe(true);
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
    expect(coreTimeline.items.map((item: { status: string }) => item.status)).toEqual([
      "failed",
      "operational",
    ]);

    const dashboard30dPayload = JSON.parse(
      db.rows.get("dashboard:30d")?.payload_json ?? "{}"
    );
    const core30dTimeline = dashboard30dPayload.providerTimelines.find(
      (timeline: { id: string }) => timeline.id === "core-1"
    );
    expect(core30dTimeline.items.map((item: { status: string }) => item.status)).toEqual([
      "degraded",
      "failed",
      "operational",
    ]);
  });
});
