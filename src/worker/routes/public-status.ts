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

interface SnapshotSite {
  siteName: string;
  statusTitle: string;
  description: string | null;
  logoUrl: string | null;
  faviconUrl?: string | null;
  publicOrigin: string | null;
}

interface SnapshotChannelModel {
  id: string;
  name: string;
  type: string;
  model: string | null;
  status: string;
  latencyMs: number | null;
  checkedAt: string | null;
  message: string | null;
  availability?: Record<string, number>;
  history?: Array<{
    status: string;
    latencyMs: number | null;
    checkedAt: string | null;
  }>;
}

interface SnapshotChannel {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  models: SnapshotChannelModel[];
}

export interface DashboardSnapshotPayload {
  site?: SnapshotSite;
  channels?: SnapshotChannel[];
  providerTimelines?: SnapshotProvider[];
  lastUpdated?: string | null;
  availabilityStats?: Record<string, SnapshotAvailabilityStat[]>;
  generatedAt?: number;
}

export interface PublicStatusPayload {
  version: 2;
  generatedAt: string | null;
  period: TrendPeriod;
  overallStatus: PublicOverallStatus;
  site: SnapshotSite | null;
  summary: Record<PublicProviderStatus, number> & { total: number };
  channels: PublicStatusChannel[];
}

type PublicStatusModel = {
  id: string;
  name: string;
  type: string;
  model: string | null;
  status: PublicProviderStatus;
  latencyMs: number | null;
  checkedAt: string | null;
  message: string | null;
  availability: Record<string, number>;
  history: Array<{
    status: PublicProviderStatus;
    latencyMs: number | null;
    checkedAt: string | null;
  }>;
};

type PublicStatusChannel = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  statusPageUrl: string | null;
  models: PublicStatusModel[];
};

const PROVIDER_GROUP_LABEL: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Claude",
};

function getProviderGroup(type: string): string {
  return PROVIDER_GROUP_LABEL[type] ?? type;
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

function flattenModels(channels: PublicStatusChannel[]) {
  return channels.flatMap((channel) => channel.models);
}

function summarizeModels(models: PublicStatusModel[]) {
  const summary = {
    total: models.length,
    operational: 0,
    degraded: 0,
    failed: 0,
    maintenance: 0,
    unknown: 0,
  };
  for (const model of models) {
    summary[model.status] += 1;
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

function buildChannelsFromSnapshot(snapshot: DashboardSnapshotPayload | null) {
  return (snapshot?.channels ?? []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl ?? null,
    websiteUrl: channel.websiteUrl ?? null,
    statusPageUrl: channel.statusPageUrl ?? null,
    models: channel.models.map((model) => ({
      id: model.id,
      name: model.name,
      type: model.type,
      model: model.model ?? null,
      status: toPublicStatus(model.status),
      latencyMs: typeof model.latencyMs === "number" ? model.latencyMs : null,
      checkedAt: toIsoDate(model.checkedAt),
      message: sanitizeText(model.message),
      availability: model.availability ?? {},
      history: (model.history ?? []).map((item) => ({
        status: toPublicStatus(item.status),
        latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
        checkedAt: toIsoDate(item.checkedAt),
      })),
    })),
  }));
}

function buildChannelsFromLegacySnapshot(snapshot: DashboardSnapshotPayload | null) {
  const grouped = new Map<string, PublicStatusChannel>();
  for (const timeline of snapshot?.providerTimelines ?? []) {
    const latest = timeline.latest ?? {};
    const id = latest.id ?? timeline.id;
    const channelName = latest.type ? getProviderGroup(latest.type) : "Unknown";
    const channelId = `legacy:${channelName}`;
    const channel = grouped.get(channelId) ?? {
      id: channelId,
      name: channelName,
      logoUrl: null,
      websiteUrl: null,
      statusPageUrl: null,
      models: [],
    };
    channel.models.push({
      id,
      name: latest.name ?? id,
      type: latest.type ?? "unknown",
      model: latest.model ?? null,
      status: toPublicStatus(latest.status),
      latencyMs: typeof latest.latencyMs === "number" ? latest.latencyMs : null,
      checkedAt: toIsoDate(latest.checkedAt),
      message: sanitizeText(latest.message),
      availability: buildAvailability(snapshot?.availabilityStats?.[id]),
      history: [],
    });
    grouped.set(channelId, channel);
  }
  return [...grouped.values()];
}

export function buildPublicStatusPayload(
  snapshot: DashboardSnapshotPayload | null,
  period: TrendPeriod
): PublicStatusPayload {
  const channels =
    snapshot?.channels && snapshot.channels.length > 0
      ? buildChannelsFromSnapshot(snapshot)
      : buildChannelsFromLegacySnapshot(snapshot);
  const summary = summarizeModels(flattenModels(channels));

  return {
    version: 2,
    generatedAt: toIsoDate(snapshot?.lastUpdated ?? snapshot?.generatedAt),
    period,
    overallStatus: getOverallStatus(summary),
    site: snapshot?.site ?? null,
    summary,
    channels,
  };
}
