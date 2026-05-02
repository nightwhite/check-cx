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
const PERIOD_DAYS: Record<(typeof PERIODS)[number], number> = {
  "7d": 7,
  "15d": 15,
  "30d": 30,
};

interface GroupInfoRow {
  group_name: string;
  website_url: string | null;
  tags: string | null;
}

interface CheckHistoryRow {
  config_id: string;
  name: string;
  type: WorkerCheckResult["type"];
  endpoint: string;
  model: string;
  group_name: string | null;
  status: WorkerCheckResult["status"];
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at_ms: number;
  message: string | null;
  log_message: string | null;
}

interface D1StatementWithAll extends D1StatementLike {
  bind(...values: unknown[]): D1StatementWithAll;
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

function sortByCheckedAt(items: WorkerCheckResult[]): WorkerCheckResult[] {
  return [...items].sort(
    (left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt)
  );
}

function mergeTimelineItems(
  result: WorkerCheckResult,
  historyByConfig: Map<string, WorkerCheckResult[]>
) {
  const historicalItems = historyByConfig.get(result.id) ?? [];
  const includesLatest = historicalItems.some(
    (item) => item.checkedAt === result.checkedAt
  );
  return sortByCheckedAt(
    includesLatest ? historicalItems : [...historicalItems, result]
  );
}

function buildPayload(
  results: WorkerCheckResult[],
  period: string,
  nowMs: number,
  historyByConfig: Map<string, WorkerCheckResult[]>
) {
  const providerTimelines = results.map((result) => ({
    id: result.id,
    items: mergeTimelineItems(result, historyByConfig),
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
  historyByConfig: Map<string, WorkerCheckResult[]>,
  info?: GroupInfoRow
) {
  const payload = buildPayload(results, period, nowMs, historyByConfig);
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

function toHistoryResult(row: CheckHistoryRow): WorkerCheckResult {
  return {
    id: row.config_id,
    name: row.name,
    type: row.type,
    endpoint: row.endpoint,
    model: row.model,
    status: row.status,
    latencyMs: row.latency_ms,
    pingLatencyMs: row.ping_latency_ms,
    checkedAt: new Date(row.checked_at_ms).toISOString(),
    message: row.message ?? "",
    logMessage: row.log_message ?? undefined,
    groupName: row.group_name,
  };
}

async function loadHistoryByConfig(
  db: DashboardSnapshotExecutor,
  results: WorkerCheckResult[],
  period: (typeof PERIODS)[number],
  nowMs: number
) {
  const ids = results.map((result) => result.id);
  const historyByConfig = new Map<string, WorkerCheckResult[]>();
  if (ids.length === 0) {
    return historyByConfig;
  }

  const placeholders = ids.map(() => "?").join(", ");
  const cutoffMs = nowMs - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  const rows = await db
    .prepare(
      `SELECT
         h.config_id,
         c.name,
         c.type,
         c.endpoint,
         m.model,
         c.group_name,
         h.status,
         h.latency_ms,
         h.ping_latency_ms,
         h.checked_at_ms,
         h.message,
         h.log_message
       FROM check_history h
       JOIN check_configs c ON c.id = h.config_id
       JOIN check_models m ON m.id = c.model_id
       WHERE h.config_id IN (${placeholders})
         AND h.checked_at_ms >= ?
         AND h.checked_at_ms <= ?
       ORDER BY h.config_id, h.checked_at_ms ASC`
    )
    .bind(...ids, cutoffMs, nowMs)
    .all<CheckHistoryRow>();

  for (const row of rows.results ?? []) {
    const items = historyByConfig.get(row.config_id) ?? [];
    items.push(toHistoryResult(row));
    historyByConfig.set(row.config_id, items);
  }

  return historyByConfig;
}

export async function writeDashboardSnapshot(
  db: DashboardSnapshotExecutor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<DashboardSnapshotWriteSummary> {
  const repository = createDashboardSnapshotRepository(db);
  let writtenSnapshots = 0;
  const historyByPeriod = new Map<string, Map<string, WorkerCheckResult[]>>();

  for (const period of PERIODS) {
    const historyByConfig = await loadHistoryByConfig(db, results, period, nowMs);
    historyByPeriod.set(period, historyByConfig);
    const payloadJson = JSON.stringify(
      buildPayload(results, period, nowMs, historyByConfig)
    );
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
          historyByPeriod.get(period) ?? new Map(),
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
