import {
  createDashboardSnapshotRepository,
  type D1Executor,
  type D1StatementLike,
} from "../db/repositories";
import type { WorkerCheckResult } from "../providers";

export interface DashboardSnapshotWriteSummary {
  writtenSnapshots: number;
}

const PERIODS = ["7d", "15d", "30d"] as const;

interface GroupInfoRow {
  group_name: string;
  website_url: string | null;
  tags: string | null;
}

interface D1StatementWithAll extends D1StatementLike {
  all<T>(): Promise<{ results?: T[] }>;
}

interface DashboardSnapshotExecutor extends D1Executor {
  prepare(query: string): D1StatementWithAll;
}

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

function buildGroupPayload(
  groupName: string,
  results: WorkerCheckResult[],
  period: string,
  nowMs: number,
  info?: GroupInfoRow
) {
  const payload = buildPayload(results, period, nowMs);
  return {
    groupName,
    displayName: groupName,
    tags: info?.tags ?? "",
    providerTimelines: payload.providerTimelines,
    lastUpdated: payload.lastUpdated,
    total: payload.total,
    pollIntervalLabel: payload.pollIntervalLabel,
    pollIntervalMs: payload.pollIntervalMs,
    availabilityStats: payload.availabilityStats,
    trendPeriod: payload.trendPeriod,
    generatedAt: payload.generatedAt,
    websiteUrl: info?.website_url ?? null,
  };
}

async function loadGroupInfoMap(db: DashboardSnapshotExecutor) {
  const result = await db
    .prepare("SELECT group_name, website_url, tags FROM group_info")
    .all<GroupInfoRow>();
  return new Map((result.results ?? []).map((row) => [row.group_name, row]));
}

export async function writeDashboardSnapshot(
  db: DashboardSnapshotExecutor,
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
  const groupInfoMap = await loadGroupInfoMap(db);

  for (const groupName of groupNames) {
    const groupResults = results.filter((result) => result.groupName === groupName);
    for (const period of PERIODS) {
      const payloadJson = JSON.stringify(
        buildGroupPayload(
          groupName,
          groupResults,
          period,
          nowMs,
          groupInfoMap.get(groupName)
        )
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
