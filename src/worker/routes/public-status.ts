import type { TrendPeriod } from "./trend-period";

type PublicProviderStatus =
  | "operational"
  | "degraded"
  | "failed"
  | "maintenance"
  | "unknown";
type PublicOverallStatus = PublicProviderStatus;

interface SnapshotProvider {
  id: string;
  latest?: {
    id?: string;
    name?: string;
    type?: string;
    model?: string | null;
    groupName?: string | null;
    status?: string;
    latencyMs?: number | null;
    checkedAt?: string | null;
    message?: string | null;
  };
}

interface SnapshotAvailabilityStat {
  period: string;
  availabilityPct: number | null;
}

export interface DashboardSnapshotPayload {
  providerTimelines?: SnapshotProvider[];
  lastUpdated?: string | null;
  availabilityStats?: Record<string, SnapshotAvailabilityStat[]>;
  generatedAt?: number;
}

export interface PublicStatusPayload {
  version: 1;
  generatedAt: string | null;
  period: TrendPeriod;
  overallStatus: PublicOverallStatus;
  summary: Record<PublicProviderStatus, number> & { total: number };
  providers: Array<{
    id: string;
    name: string;
    type: string;
    model: string | null;
    group: string | null;
    status: PublicProviderStatus;
    latencyMs: number | null;
    checkedAt: string | null;
    message: string | null;
    availability: Record<string, number>;
  }>;
}

function toPublicStatus(status: string | undefined): PublicProviderStatus {
  if (status === "operational" || status === "degraded" || status === "maintenance") {
    return status;
  }
  if (status === "failed" || status === "validation_failed" || status === "error") {
    return "failed";
  }
  return "unknown";
}

function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const firstLine = value.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
}

function buildAvailability(
  stats: SnapshotAvailabilityStat[] | undefined
): Record<string, number> {
  const availability: Record<string, number> = {};
  for (const stat of stats ?? []) {
    if (typeof stat.availabilityPct === "number") {
      availability[stat.period] = stat.availabilityPct;
    }
  }
  return availability;
}

function summarizeProviders(providers: PublicStatusPayload["providers"]) {
  const summary = {
    total: providers.length,
    operational: 0,
    degraded: 0,
    failed: 0,
    maintenance: 0,
    unknown: 0,
  };
  for (const provider of providers) {
    summary[provider.status] += 1;
  }
  return summary;
}

function getOverallStatus(
  summary: PublicStatusPayload["summary"]
): PublicOverallStatus {
  if (summary.total === 0) {
    return "unknown";
  }
  if (summary.failed > 0) {
    return "failed";
  }
  if (summary.degraded > 0) {
    return "degraded";
  }
  if (summary.maintenance === summary.total) {
    return "maintenance";
  }
  if (summary.unknown > 0) {
    return "unknown";
  }
  return "operational";
}

export function buildPublicStatusPayload(
  snapshot: DashboardSnapshotPayload | null,
  period: TrendPeriod
): PublicStatusPayload {
  const providers = (snapshot?.providerTimelines ?? []).map((timeline) => {
    const latest = timeline.latest ?? {};
    const id = latest.id ?? timeline.id;
    return {
      id,
      name: latest.name ?? id,
      type: latest.type ?? "unknown",
      model: latest.model ?? null,
      group: latest.groupName ?? null,
      status: toPublicStatus(latest.status),
      latencyMs: typeof latest.latencyMs === "number" ? latest.latencyMs : null,
      checkedAt: toIsoDate(latest.checkedAt),
      message: sanitizeText(latest.message),
      availability: buildAvailability(snapshot?.availabilityStats?.[id]),
    };
  });
  const summary = summarizeProviders(providers);

  return {
    version: 1,
    generatedAt: toIsoDate(snapshot?.lastUpdated ?? snapshot?.generatedAt),
    period,
    overallStatus: getOverallStatus(summary),
    summary,
    providers,
  };
}
