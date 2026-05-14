import {
  createDashboardSnapshotRepository,
  type D1Executor,
  type D1StatementLike,
  type DashboardSnapshotRecord,
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
const HISTORY_ID_CHUNK_SIZE = 90;
const HISTORY_LIMIT_PER_CONFIG = 60;

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

interface AvailabilityRollupRow {
  config_id: string;
  period: (typeof PERIODS)[number];
  total_checks: number;
  operational_count: number;
}

interface AvailabilityStat {
  period: (typeof PERIODS)[number];
  totalChecks: number;
  operationalCount: number;
  availabilityPct: number | null;
}

interface OfficialStatusRow {
  provider: string;
  status: "operational" | "degraded" | "down" | "unknown";
  message: string;
  affected_components_json: string | null;
  checked_at_ms: number;
}

interface OfficialStatusResult {
  status: "operational" | "degraded" | "down" | "unknown";
  message: string;
  checkedAt: string;
  affectedComponents?: string[];
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

function toGroupInfoSummaries(groupInfoMap: Map<string, GroupInfoRow>) {
  return [...groupInfoMap.values()]
    .map((info) => ({
      groupName: info.group_name,
      websiteUrl: info.website_url ?? null,
      tags: info.tags ?? "",
    }))
    .sort((left, right) => left.groupName.localeCompare(right.groupName));
}

function withOfficialStatus(
  result: WorkerCheckResult,
  officialStatusByType: Map<WorkerCheckResult["type"], OfficialStatusResult>
): WorkerCheckResult {
  const officialStatus = officialStatusByType.get(result.type);
  if (!officialStatus) {
    return result;
  }

  return { ...result, officialStatus };
}

function buildPayload(
  results: WorkerCheckResult[],
  period: string,
  nowMs: number,
  historyByConfig: Map<string, WorkerCheckResult[]>,
  groupInfos: ReturnType<typeof toGroupInfoSummaries>,
  availabilityStats: Record<string, AvailabilityStat[]>,
  officialStatusByType: Map<WorkerCheckResult["type"], OfficialStatusResult>
) {
  const providerTimelines = results.map((result) => ({
    id: result.id,
    items: mergeTimelineItems(result, historyByConfig).map((item) =>
      withOfficialStatus(item, officialStatusByType)
    ),
    latest: withOfficialStatus(result, officialStatusByType),
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
    groupInfos,
    lastUpdated,
    total: providerTimelines.length,
    pollIntervalLabel: "60 秒",
    pollIntervalMs: 60_000,
    availabilityStats,
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
  availabilityStats: Record<string, AvailabilityStat[]>,
  officialStatusByType: Map<WorkerCheckResult["type"], OfficialStatusResult>,
  info?: GroupInfoRow
) {
  const payload = buildPayload(
    results,
    period,
    nowMs,
    historyByConfig,
    [],
    availabilityStats,
    officialStatusByType
  );
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

function buildAvailabilityStats(rows: AvailabilityRollupRow[]) {
  const stats: Record<string, AvailabilityStat[]> = {};
  for (const row of rows) {
    const entry: AvailabilityStat = {
      period: row.period,
      totalChecks: row.total_checks,
      operationalCount: row.operational_count,
      availabilityPct:
        row.total_checks > 0
          ? Math.round((row.operational_count / row.total_checks) * 10_000) / 100
          : null,
    };
    stats[row.config_id] = [...(stats[row.config_id] ?? []), entry];
  }

  for (const entries of Object.values(stats)) {
    entries.sort(
      (left, right) => PERIODS.indexOf(left.period) - PERIODS.indexOf(right.period)
    );
  }

  return stats;
}

async function loadAvailabilityStats(
  db: DashboardSnapshotExecutor,
  results: WorkerCheckResult[]
) {
  const ids = results.map((result) => result.id);
  const rows: AvailabilityRollupRow[] = [];
  for (let index = 0; index < ids.length; index += HISTORY_ID_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + HISTORY_ID_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `SELECT config_id, period, total_checks, operational_count
         FROM availability_rollups
         WHERE config_id IN (${placeholders})
         ORDER BY config_id, period`
      )
      .bind(...chunk)
      .all<AvailabilityRollupRow>();
    rows.push(...(result.results ?? []));
  }

  return buildAvailabilityStats(rows);
}

function parseAffectedComponents(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const items = parsed.filter((item): item is string => typeof item === "string");
      return items.length > 0 ? items : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function loadOfficialStatuses(db: DashboardSnapshotExecutor) {
  const rows = await db
    .prepare(
      `SELECT provider, status, message, affected_components_json, checked_at_ms
       FROM official_status_snapshots`
    )
    .all<OfficialStatusRow>();
  return new Map(
    (rows.results ?? []).map((row) => [
      row.provider as WorkerCheckResult["type"],
      {
        status: row.status,
        message: row.message,
        checkedAt: new Date(row.checked_at_ms).toISOString(),
        affectedComponents: parseAffectedComponents(row.affected_components_json),
      },
    ])
  );
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
  nowMs: number
) {
  const ids = results.map((result) => result.id);
  const historyByConfig = new Map<string, WorkerCheckResult[]>();
  if (ids.length === 0) {
    return historyByConfig;
  }

  const cutoffMs = nowMs - PERIOD_DAYS["30d"] * 24 * 60 * 60 * 1000;

  for (let index = 0; index < ids.length; index += HISTORY_ID_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + HISTORY_ID_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
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
         JOIN (
           SELECT id
           FROM (
             SELECT
               id,
               ROW_NUMBER() OVER (
                 PARTITION BY config_id
                 ORDER BY checked_at_ms DESC
               ) AS row_number
             FROM check_history
             WHERE config_id IN (${placeholders})
               AND checked_at_ms >= ?
               AND checked_at_ms <= ?
           )
           WHERE row_number <= ?
         ) limited ON limited.id = h.id
         ORDER BY h.config_id, h.checked_at_ms ASC`
      )
      .bind(...chunk, cutoffMs, nowMs, HISTORY_LIMIT_PER_CONFIG)
      .all<CheckHistoryRow>();

    for (const row of rows.results ?? []) {
      const items = historyByConfig.get(row.config_id) ?? [];
      items.push(toHistoryResult(row));
      historyByConfig.set(row.config_id, items);
    }
  }

  return historyByConfig;
}

function filterHistoryByPeriod(
  historyByConfig: Map<string, WorkerCheckResult[]>,
  period: (typeof PERIODS)[number],
  nowMs: number
) {
  const cutoffMs = nowMs - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  const filtered = new Map<string, WorkerCheckResult[]>();

  for (const [configId, items] of historyByConfig) {
    filtered.set(
      configId,
      items.filter((item) => {
        const checkedAtMs = Date.parse(item.checkedAt);
        return checkedAtMs >= cutoffMs && checkedAtMs <= nowMs;
      })
    );
  }

  return filtered;
}

export async function writeDashboardSnapshot(
  db: DashboardSnapshotExecutor,
  results: WorkerCheckResult[],
  nowMs: number
): Promise<DashboardSnapshotWriteSummary> {
  const repository = createDashboardSnapshotRepository(db);
  const historyByPeriod = new Map<string, Map<string, WorkerCheckResult[]>>();
  const records: DashboardSnapshotRecord[] = [];
  const historyByConfig = await loadHistoryByConfig(db, results, nowMs);
  const groupInfoMap = await loadGroupInfoMap(db);
  const groupInfos = toGroupInfoSummaries(groupInfoMap);
  const availabilityStats = await loadAvailabilityStats(db, results);
  const officialStatusByType = await loadOfficialStatuses(db);

  for (const period of PERIODS) {
    const periodHistoryByConfig = filterHistoryByPeriod(
      historyByConfig,
      period,
      nowMs
    );
    historyByPeriod.set(period, periodHistoryByConfig);
    const payloadJson = JSON.stringify(
      buildPayload(
        results,
        period,
        nowMs,
        periodHistoryByConfig,
        groupInfos,
        availabilityStats,
        officialStatusByType
      )
    );
    records.push({
      snapshotKey: "dashboard",
      period,
      payloadJson,
      etag: generateETag(payloadJson),
      generatedAtMs: nowMs,
    });
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
        buildGroupPayload(
          groupName,
          groupResults,
          period,
          nowMs,
          historyByPeriod.get(period) ?? new Map(),
          availabilityStats,
          officialStatusByType,
          groupInfoMap.get(groupName)
        )
      );
      records.push({
        snapshotKey: `group:${groupName}`,
        period,
        payloadJson,
        etag: generateETag(payloadJson),
        generatedAtMs: nowMs,
      });
    }
  }

  await repository.upsertMany(records);

  return { writtenSnapshots: records.length };
}
