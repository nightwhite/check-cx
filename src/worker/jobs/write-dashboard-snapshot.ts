import { createDashboardSnapshotRepository, type D1Executor } from "../db/repositories";
import type { WorkerCheckResult } from "../providers";

export interface DashboardSnapshotWriteSummary {
  writtenSnapshots: number;
}

const PERIODS = ["7d", "15d", "30d"] as const;

function generateETag(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

function buildPayload(results: WorkerCheckResult[], period: string, nowMs: number) {
  const providerTimelines = results.map((result) => ({
    id: result.id,
    items: [result],
    latest: result,
  }));
  const lastUpdated =
    results.length > 0
      ? results
          .map((result) => result.checkedAt)
          .sort()
          .at(-1) ?? null
      : null;

  return {
    providerTimelines,
    groupInfos: [],
    lastUpdated,
    total: providerTimelines.length,
    pollIntervalLabel: "60 秒",
    pollIntervalMs: 60_000,
    availabilityStats: {},
    trendPeriod: period,
    generatedAt: nowMs,
  };
}

export async function writeDashboardSnapshot(
  db: D1Executor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<DashboardSnapshotWriteSummary> {
  const repository = createDashboardSnapshotRepository(db);
  let writtenSnapshots = 0;

  for (const period of PERIODS) {
    const payloadJson = JSON.stringify(buildPayload(results, period, nowMs));
    await repository.upsert({
      snapshotKey: "dashboard",
      period,
      payloadJson,
      etag: generateETag(payloadJson),
      generatedAtMs: nowMs,
    });
    writtenSnapshots++;
  }

  const groupNames = new Set(
    results
      .map((result) => result.groupName)
      .filter((groupName): groupName is string => Boolean(groupName))
  );

  for (const groupName of groupNames) {
    const groupResults = results.filter((result) => result.groupName === groupName);
    for (const period of PERIODS) {
      const payloadJson = JSON.stringify(
        buildPayload(groupResults, period, nowMs)
      );
      await repository.upsert({
        snapshotKey: `group:${groupName}`,
        period,
        payloadJson,
        etag: generateETag(payloadJson),
        generatedAtMs: nowMs,
      });
      writtenSnapshots++;
    }
  }

  return { writtenSnapshots };
}
