"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Radio,
  RefreshCcw,
  Search,
  Zap,
} from "lucide-react";

import type {
  AvailabilityPeriod,
  AvailabilityStat,
  DashboardData,
  HealthStatus,
  ProviderTimeline,
  TimelineItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIODS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d", label: "7 天" },
  { value: "15d", label: "15 天" },
  { value: "30d", label: "30 天" },
];
const SITE_NAME = "SU8";
const HISTORY_SEGMENT_COUNT = 60;

const STATUS_LABEL: Record<string, string> = {
  operational: "正常",
  degraded: "延迟",
  failed: "异常",
  validation_failed: "验证失败",
  maintenance: "维护中",
  error: "错误",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  failed: "bg-rose-500",
  validation_failed: "bg-orange-500",
  maintenance: "bg-sky-500",
  error: "bg-red-600",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  operational: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  degraded: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  validation_failed: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  maintenance: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  error: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-300",
};

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Claude",
};

function getProviderFamily(type: string) {
  return PROVIDER_LABEL[type] ?? type;
}

function formatLatency(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "—";
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "暂无数据";
  }
  return new Date(value).toLocaleString();
}

function formatCountdown(ms: number | null) {
  if (typeof ms !== "number") {
    return null;
  }
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, "0")}s` : `${rest}s`;
}

function getProviderFamilies(data: DashboardData | null) {
  const families = new Set<string>();
  for (const timeline of data?.providerTimelines ?? []) {
    families.add(getProviderFamily(timeline.latest.type));
  }
  return [...families].sort((left, right) => left.localeCompare(right));
}

function getSiteInfo(data: DashboardData | null) {
  return data?.groupInfos.find((info) => info.groupName === SITE_NAME) ?? null;
}

function getAvailabilityStat(
  data: DashboardData | null,
  timeline: ProviderTimeline,
  period: AvailabilityPeriod
) {
  return data?.availabilityStats?.[timeline.id]?.find(
    (item) => item.period === period
  ) ?? null;
}

function matchesSearch(timeline: ProviderTimeline, query: string) {
  if (!query) {
    return true;
  }

  const target = [
    timeline.latest.name,
    timeline.latest.model,
    timeline.latest.type,
    getProviderFamily(timeline.latest.type),
    timeline.latest.endpoint,
  ]
    .join(" ")
    .toLowerCase();

  return target.includes(query.toLowerCase());
}

function getInitialProviderFamily() {
  if (typeof window === "undefined") {
    return "all";
  }

  const groupFromQuery = new URLSearchParams(window.location.search).get("group");
  if (groupFromQuery) {
    return groupFromQuery;
  }

  const match = window.location.pathname.match(/^\/group\/([^/]+)\/?$/);
  if (!match) {
    return "all";
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getLatestCheckTimestamp(timelines: ProviderTimeline[]) {
  const timestamps = timelines
    .map((timeline) => new Date(timeline.latest.checkedAt).getTime())
    .filter((value) => !Number.isNaN(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function computeRemainingMs(
  pollIntervalMs: number | null | undefined,
  latestCheckTimestamp: number | null
) {
  if (!pollIntervalMs || pollIntervalMs <= 0 || latestCheckTimestamp === null) {
    return null;
  }
  return Math.max(0, pollIntervalMs - (Date.now() - latestCheckTimestamp));
}

function getOverallStatus(timelines: ProviderTimeline[]): HealthStatus | "unknown" {
  const statuses = timelines.map((timeline) => timeline.latest.status);
  if (statuses.length === 0) {
    return "unknown";
  }
  if (statuses.some((status) => status === "failed" || status === "error")) {
    return "failed";
  }
  if (statuses.some((status) => status === "validation_failed")) {
    return "validation_failed";
  }
  if (statuses.some((status) => status === "degraded")) {
    return "degraded";
  }
  if (statuses.every((status) => status === "maintenance")) {
    return "maintenance";
  }
  return "operational";
}

function getAvailabilityColor(pct: number | null | undefined) {
  if (pct === null || pct === undefined) {
    return "text-muted-foreground";
  }
  if (pct >= 99) {
    return "text-emerald-600 dark:text-emerald-300";
  }
  if (pct >= 95) {
    return "text-lime-600 dark:text-lime-300";
  }
  if (pct >= 90) {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-rose-600 dark:text-rose-300";
}

function SummaryPill({
  status,
  count,
}: {
  status: string;
  count: number;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_PILL_CLASS[status] ?? "border-border bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          STATUS_DOT_CLASS[status] ?? "bg-muted-foreground"
        )}
      />
      {count} {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function CornerPlus({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={cn("pointer-events-none absolute h-4 w-4 text-muted-foreground/35", className)}
    >
      <line x1="12" y1="0" x2="12" y2="24" />
      <line x1="0" y1="12" x2="24" y2="12" />
    </svg>
  );
}

function PeriodSwitch({
  period,
  setPeriod,
}: {
  period: AvailabilityPeriod;
  setPeriod: (period: AvailabilityPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1 shadow-sm">
      {PERIODS.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => setPeriod(item.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            period === item.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatusHistory({ items }: { items: TimelineItem[] }) {
  const segments = Array.from(
    { length: HISTORY_SEGMENT_COUNT },
    (_, index) => items[index] ?? null
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>过去</span>
        <span>{Math.min(items.length, HISTORY_SEGMENT_COUNT)} 点</span>
        <span>现在</span>
      </div>
      <div className="flex h-9 flex-row-reverse gap-[2px] rounded-md bg-muted/25 p-[3px]">
        {segments.map((segment, index) => (
          <span
            key={segment ? `${segment.id}-${segment.checkedAt}` : `empty-${index}`}
            aria-label={
              segment
                ? `${formatTime(segment.checkedAt)} ${STATUS_LABEL[segment.status] ?? segment.status}`
                : "暂无数据"
            }
            title={
              segment
                ? `${formatTime(segment.checkedAt)} · ${STATUS_LABEL[segment.status] ?? segment.status} · ${formatLatency(segment.latencyMs)}`
                : "暂无数据"
            }
            className={cn(
              "min-w-0 flex-1 rounded-[2px]",
              segment
                ? STATUS_DOT_CLASS[segment.status] ?? "bg-muted-foreground"
                : "bg-muted/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderRow({
  timeline,
  period,
  availability,
}: {
  timeline: ProviderTimeline;
  period: AvailabilityPeriod;
  availability: AvailabilityStat | null;
}) {
  const latest = timeline.latest;
  const statusClass =
    STATUS_PILL_CLASS[latest.status] ?? "border-border bg-muted text-muted-foreground";
  const availabilityPct = availability?.availabilityPct ?? null;
  const availabilityLabel =
    availabilityPct === null ? "—" : `${availabilityPct.toFixed(2)}%`;

  return (
    <article className="group relative flex min-h-[360px] flex-col overflow-hidden rounded-3xl border border-border/45 bg-background/45 shadow-sm backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-xl hover:shadow-foreground/5">
      <CornerPlus className="left-3 top-3 opacity-0 transition-opacity group-hover:opacity-100" />
      <CornerPlus className="right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100" />

      {latest.officialStatus?.message && (
        <div className="flex items-start gap-2.5 border-b border-amber-500/25 bg-amber-500/10 px-5 py-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>官方状态：{latest.officialStatus.message}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-3">
              <h2 className="line-clamp-2 text-2xl font-extrabold leading-tight tracking-normal">
                {latest.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted/55 shadow-sm ring-1 ring-border/65 transition-transform group-hover:scale-105">
                  <span className="text-sm font-black uppercase text-foreground/80">
                    {(PROVIDER_LABEL[latest.type] ?? latest.type).slice(0, 2)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/70">
                    {PROVIDER_LABEL[latest.type] ?? latest.type}
                  </span>
                  <span className="truncate font-medium">{latest.model}</span>
                </div>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold",
                statusClass
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_DOT_CLASS[latest.status] ?? "bg-muted-foreground"
                )}
              />
              {STATUS_LABEL[latest.status] ?? latest.status}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted/30 p-4 transition-colors group-hover:bg-muted/45">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              首字延迟
            </div>
            <div className="mt-2 text-xl font-semibold leading-none">
              {formatLatency(latest.latencyMs)}
            </div>
          </div>
          <div className="rounded-2xl bg-muted/30 p-4 transition-colors group-hover:bg-muted/45">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              端点 Ping
            </div>
            <div className="mt-2 text-xl font-semibold leading-none">
              {formatLatency(latest.pingLatencyMs)}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                可用性 ({PERIODS.find((item) => item.value === period)?.label ?? period})
              </div>
              <div className="text-xs text-muted-foreground">
                {availability
                  ? `${availability.operationalCount}/${availability.totalChecks} 成功`
                  : "暂无数据"}
              </div>
            </div>
            <div className={cn("text-2xl font-black", getAvailabilityColor(availabilityPct))}>
              {availabilityLabel}
            </div>
          </div>
        </div>

        <div className="mt-auto border-t border-border/35 pt-5">
          <StatusHistory items={timeline.items} />
        </div>
      </div>

      {latest.message && latest.message !== "OK" && (
        <div className="border-t border-border/45 bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
          {latest.message}
        </div>
      )}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-3xl border border-border/50 bg-muted/40" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-2xl border border-border/50 bg-muted/30"
        />
      ))}
    </div>
  );
}

export function DashboardIsland() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<AvailabilityPeriod>("30d");
  const [query, setQuery] = useState("");
  const [providerFamily, setProviderFamily] = useState(getInitialProviderFamily);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadDashboard = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/dashboard?trendPeriod=${period}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Dashboard request failed: ${response.status}`);
      }
      const nextData = (await response.json()) as DashboardData;
      if (requestId !== requestIdRef.current) {
        return;
      }
      setData(nextData);
      setErrorMessage(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [period]);

  useEffect(() => {
    loadDashboard().catch(() => undefined);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadDashboard]);

  useEffect(() => {
    const intervalMs = data?.pollIntervalMs;
    if (!intervalMs || intervalMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      loadDashboard().catch(() => undefined);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [data?.pollIntervalMs, loadDashboard]);

  const latestCheckTimestamp = useMemo(
    () => getLatestCheckTimestamp(data?.providerTimelines ?? []),
    [data?.providerTimelines]
  );

  useEffect(() => {
    if (!data?.pollIntervalMs || latestCheckTimestamp === null) {
      setTimeToNextRefresh(null);
      return;
    }
    const update = () => {
      setTimeToNextRefresh(
        computeRemainingMs(data.pollIntervalMs, latestCheckTimestamp)
      );
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [data?.pollIntervalMs, latestCheckTimestamp]);

  const providerFamilies = useMemo(() => getProviderFamilies(data), [data]);
  const activeProviderFamily = useMemo(() => {
    if (providerFamily === "all") {
      return "all";
    }

    return (
      providerFamilies.find(
        (family) => family.toLowerCase() === providerFamily.toLowerCase()
      ) ?? providerFamily
    );
  }, [providerFamilies, providerFamily]);
  const timelines = useMemo(() => {
    return (data?.providerTimelines ?? [])
      .filter((timeline) => {
        if (activeProviderFamily === "all") {
          return true;
        }
        return getProviderFamily(timeline.latest.type).toLowerCase() ===
          activeProviderFamily.toLowerCase();
      })
      .filter((timeline) => matchesSearch(timeline, query))
      .sort((left, right) => left.latest.name.localeCompare(right.latest.name));
  }, [activeProviderFamily, data, query]);
  const siteInfo = useMemo(() => getSiteInfo(data), [data]);
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const timeline of timelines) {
      counts.set(timeline.latest.status, (counts.get(timeline.latest.status) ?? 0) + 1);
    }
    return counts;
  }, [timelines]);
  const overallStatus = getOverallStatus(timelines);
  const overallLabel =
    overallStatus === "unknown" ? "暂无数据" : STATUS_LABEL[overallStatus] ?? overallStatus;
  const countdown = formatCountdown(timeToNextRefresh);

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-7">
      <CornerPlus className="fixed left-4 top-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed right-4 top-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed bottom-4 left-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed bottom-4 right-4 hidden h-6 w-6 text-border md:block" />

      <header className="relative z-10 flex flex-col gap-7 py-6 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Activity className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
                Status Page
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="text-5xl font-black tracking-normal text-foreground md:text-7xl">
                {SITE_NAME}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {siteInfo?.websiteUrl && (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                    href={siteInfo.websiteUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {siteInfo.websiteUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold",
                overallStatus === "unknown"
                  ? "border-border bg-muted text-muted-foreground"
                  : STATUS_PILL_CLASS[overallStatus]
              )}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  overallStatus === "unknown"
                    ? "bg-muted-foreground"
                    : STATUS_DOT_CLASS[overallStatus]
                )}
              />
              {overallLabel}
            </span>
            <div className="text-xs text-muted-foreground">
              更新于 {formatTime(data?.lastUpdated)}
              {countdown ? ` · 下次检查 ${countdown}` : ""}
            </div>
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold transition hover:border-foreground/40"
            >
              <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["operational", "degraded", "failed", "validation_failed", "maintenance", "error"].map((status) => (
            <SummaryPill key={status} status={status} count={summary.get(status) ?? 0} />
          ))}
          <span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
            {timelines.length} 个配置
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm lg:flex-row lg:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">搜索 Provider、模型或端点</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="provider-search"
            name="provider-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Provider、模型或端点"
            className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </label>
        <select
          id="provider-family-filter"
          name="provider-family-filter"
          aria-label="Provider 筛选"
          value={activeProviderFamily}
          onChange={(event) => setProviderFamily(event.target.value)}
          className="h-10 rounded-full border border-border bg-background px-3 text-sm outline-none"
        >
          <option value="all">全部 Provider</option>
          {providerFamilies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <PeriodSwitch period={period} setPeriod={setPeriod} />
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {isLoading && !data ? (
        <LoadingState />
      ) : timelines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/70 bg-background/75 p-12 text-center text-sm text-muted-foreground">
          暂无匹配的健康检查快照
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-6",
            timelines.length === 1
              ? "max-w-xl md:max-w-2xl"
              : "md:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {timelines.map((timeline) => (
            <ProviderRow
              key={timeline.id}
              timeline={timeline}
              period={period}
              availability={getAvailabilityStat(data, timeline, period)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
