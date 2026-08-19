"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  RefreshCcw,
  Search,
} from "lucide-react";

import type {
  AvailabilityPeriod,
  DashboardChannel,
  DashboardChannelModel,
  DashboardData,
  HealthStatus,
  TimelineItem,
} from "@/lib/types";
import { ProviderIcon } from "@/components/provider-icon";
import { cn } from "@/lib/utils";

const PERIODS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d", label: "7 天" },
  { value: "15d", label: "15 天" },
  { value: "30d", label: "30 天" },
];
const HISTORY_SEGMENT_COUNT = 60;
const DEGRADED_THRESHOLD_MS = 30_000;

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

function getProviderDisplayName(name: string) {
  return name.replace(/^SU8\s+/i, "");
}

function formatLatency(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "—";
}

const chinaTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "暂无数据";
  }
  return chinaTimeFormatter.format(new Date(value));
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
  for (const channel of data?.channels ?? []) {
    for (const model of channel.models) {
      families.add(getProviderFamily(model.type));
    }
  }
  return [...families].sort((left, right) => left.localeCompare(right));
}

function matchesModel(model: DashboardChannelModel, query: string) {
  if (!query) {
    return true;
  }

  const target = [
    model.name,
    model.model,
    model.type,
    getProviderFamily(model.type),
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

function getInitialPeriod(): AvailabilityPeriod {
  if (typeof window === "undefined") {
    return "30d";
  }

  const period = new URLSearchParams(window.location.search).get("period");
  return PERIODS.some((item) => item.value === period)
    ? (period as AvailabilityPeriod)
    : "30d";
}

function isScreenshotMode() {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("screenshot") === "1";
}

function computeRemainingMs(nextRefreshAt: number | null) {
  if (nextRefreshAt === null) {
    return null;
  }
  return Math.max(0, nextRefreshAt - Date.now());
}

function getOverallChannelStatus(channels: DashboardChannel[]): HealthStatus | "unknown" {
  const statuses = channels.flatMap((channel) =>
    channel.models.map((model) => model.status)
  );
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

function getModelStatusClasses(model: DashboardChannelModel) {
  if (
    (model.status === "operational" || model.status === "degraded") &&
    typeof model.latencyMs === "number"
  ) {
    const isSlow = model.latencyMs > DEGRADED_THRESHOLD_MS;
    return {
      pill: isSlow
        ? STATUS_PILL_CLASS.degraded
        : STATUS_PILL_CLASS.operational,
      dot: isSlow ? STATUS_DOT_CLASS.degraded : STATUS_DOT_CLASS.operational,
    };
  }

  return {
    pill: STATUS_PILL_CLASS[model.status] ?? "border-border bg-muted text-muted-foreground",
    dot: STATUS_DOT_CLASS[model.status] ?? "bg-muted-foreground",
  };
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
    <div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-border/70 bg-background/75 p-0.5">
      {PERIODS.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => setPeriod(item.value)}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs font-semibold transition",
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

function ProviderFamilySwitch({
  families,
  activeFamily,
  setProviderFamily,
}: {
  families: string[];
  activeFamily: string;
  setProviderFamily: (family: string) => void;
}) {
  const options = [
    { value: "all", label: "全部" },
    ...families.map((family) => ({ value: family, label: family })),
  ];
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeLabel = activeFamily === "all" ? "全部" : activeFamily;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative min-w-[150px]">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`模型类型筛选 ${activeLabel}`}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-full border bg-background/75 px-3 text-left text-sm transition",
          isOpen
            ? "border-foreground/30 ring-4 ring-foreground/5"
            : "border-border/70 hover:border-foreground/25"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            类型
          </span>
          <span className="truncate font-bold text-foreground">{activeLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition",
            isOpen && "rotate-180 text-foreground"
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="模型类型筛选"
          className="absolute left-0 top-12 z-30 w-full min-w-[220px] overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-1.5 shadow-xl shadow-foreground/10 backdrop-blur"
        >
          {options.map((option) => {
            const isActive =
              activeFamily.toLowerCase() === option.value.toLowerCase();

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setProviderFamily(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isActive ? "bg-background" : "bg-muted-foreground/45"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </span>
                {isActive && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
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
        <span>最近 {Math.min(items.length, HISTORY_SEGMENT_COUNT)} 次检查</span>
        <span>最新</span>
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

function historyToTimelineItems(
  model: DashboardChannelModel
): TimelineItem[] {
  return model.history.map((item) => ({
    id: model.id,
    name: model.name,
    type: model.type,
    endpoint: model.model,
    model: model.model,
    status: item.status,
    latencyMs: item.latencyMs,
    pingLatencyMs: null,
    checkedAt: item.checkedAt,
    message: "",
  }));
}

function ChannelModelRow({
  model,
  period,
}: {
  model: DashboardChannelModel;
  period: AvailabilityPeriod;
}) {
  const statusClasses = getModelStatusClasses(model);
  const availabilityPct = model.availability[period] ?? null;
  const availabilityLabel =
    availabilityPct === null ? "—" : `${availabilityPct.toFixed(2)}%`;
  const officialStatusMessage = model.officialStatus?.message;
  const shouldShowOfficialStatus =
    model.status !== "operational" && Boolean(officialStatusMessage);

  return (
    <article className="group rounded-2xl border border-border/45 bg-background/65 p-4 shadow-sm transition hover:border-foreground/20 hover:shadow-lg hover:shadow-foreground/5">
      {shouldShowOfficialStatus && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>官方状态：{officialStatusMessage}</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_140px_minmax(280px,1.4fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div
            aria-label={`${PROVIDER_LABEL[model.type] ?? model.type} provider`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/55 shadow-sm ring-1 ring-border/65"
          >
            <ProviderIcon type={model.type} size={26} className="text-foreground/80" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold leading-tight">
              {getProviderDisplayName(model.name)}
            </h2>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/70">
                {PROVIDER_LABEL[model.type] ?? model.type}
              </span>
              <span className="truncate font-medium">{model.model}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <span
            className={cn(
              "inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold",
              statusClasses.pill
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                statusClasses.dot
              )}
            />
            {STATUS_LABEL[model.status] ?? model.status}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              可用性 ({PERIODS.find((item) => item.value === period)?.label ?? period})
            </div>
            <div className={cn("text-lg font-black", getAvailabilityColor(availabilityPct))}>
              {availabilityLabel}
            </div>
          </div>
          <StatusHistory items={historyToTimelineItems(model)} />
        </div>
      </div>

      {model.message && model.message !== "OK" && (
        <div className="mt-3 rounded-xl bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
          {model.message}
        </div>
      )}
    </article>
  );
}

function ChannelSection({
  channel,
  period,
}: {
  channel: DashboardChannel;
  period: AvailabilityPeriod;
}) {
  return (
    <section className="rounded-3xl border border-border/55 bg-background/45 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
            <Activity className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black tracking-tight">
              {channel.name}
            </h2>
            <div className="mt-1 text-xs text-muted-foreground">
              {channel.models.length} 个模型
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {channel.statusPageUrl && (
            <a
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              href={channel.statusPageUrl}
              rel="noreferrer"
              target="_blank"
            >
              官方状态页
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {channel.models.map((model) => (
          <ChannelModelRow key={model.id} model={model} period={period} />
        ))}
      </div>
    </section>
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
  const [period, setPeriod] = useState<AvailabilityPeriod>(getInitialPeriod);
  const [query, setQuery] = useState("");
  const [providerFamily, setProviderFamily] = useState(getInitialProviderFamily);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
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
      const screenshotMode = isScreenshotMode();
      const searchParams = new URLSearchParams({ trendPeriod: period });
      if (screenshotMode) {
        searchParams.set("screenshot", "1");
      }
      const response = await fetch(`/api/dashboard?${searchParams.toString()}`, {
        cache: screenshotMode ? "no-store" : "default",
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
      setNextRefreshAt(
        nextData.pollIntervalMs && nextData.pollIntervalMs > 0
          ? Date.now() + nextData.pollIntervalMs
          : null
      );
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

  useEffect(() => {
    if (nextRefreshAt === null) {
      setTimeToNextRefresh(null);
      return;
    }
    const update = () => {
      setTimeToNextRefresh(computeRemainingMs(nextRefreshAt));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [nextRefreshAt]);

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
  const channels = useMemo(() => {
    return (data?.channels ?? [])
      .map((channel) => ({
        ...channel,
        models: channel.models
          .filter((model) => {
            if (activeProviderFamily === "all") {
              return true;
            }
            return getProviderFamily(model.type).toLowerCase() ===
              activeProviderFamily.toLowerCase();
          })
          .filter((model) => matchesModel(model, query))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .filter((channel) => channel.models.length > 0);
  }, [activeProviderFamily, data, query]);
  const overallStatus = getOverallChannelStatus(channels);
  const overallLabel =
    overallStatus === "unknown" ? "暂无数据" : STATUS_LABEL[overallStatus] ?? overallStatus;
  const countdown = formatCountdown(timeToNextRefresh);

  return (
    <section
      className="relative mx-auto flex w-full max-w-7xl flex-col gap-7"
      data-dashboard-ready={!isLoading && !errorMessage ? "true" : "false"}
    >
      <CornerPlus className="fixed left-4 top-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed right-4 top-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed bottom-4 left-4 hidden h-6 w-6 text-border md:block" />
      <CornerPlus className="fixed bottom-4 right-4 hidden h-6 w-6 text-border md:block" />

      <header className="relative z-10">
        <div className="rounded-2xl border border-border/65 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {data?.site?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={data.site.siteName}
                  className="h-10 w-fit max-w-[210px] object-contain sm:h-12"
                  src={data.site.logoUrl}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                  <Activity className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 border-l border-border pl-3">
                <h1 className="text-2xl font-black leading-none tracking-[-0.045em] text-foreground sm:text-3xl">
                  Status
                </h1>
                {data?.site?.description && (
                  <p className="mt-1 max-w-[52ch] truncate text-xs text-muted-foreground sm:text-sm">
                    {data.site.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-black",
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
              <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground">
                最近更新 <strong className="text-foreground">{formatTime(data?.lastUpdated)}</strong>
              </span>
              {countdown && (
                <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground">
                  下次检查 <strong className="text-foreground">{countdown}</strong>
                </span>
              )}
              <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground">
                模型 <strong className="text-foreground">{data?.total ?? 0}</strong>
              </span>
              {data?.site?.publicOrigin && (
                <a
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-foreground/25"
                  href={data.site.publicOrigin}
                  rel="noreferrer"
                  target="_blank"
                >
                  官网
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/55 bg-background/45 p-2">
        <label className="relative block min-w-[220px] flex-[1_1_280px]">
          <span className="sr-only">搜索模型、类型或端点</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="provider-search"
            name="provider-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型、类型或端点"
            className="h-8 w-full rounded-full border border-border bg-background/75 pl-8 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </label>
        <ProviderFamilySwitch
          families={providerFamilies}
          activeFamily={activeProviderFamily}
          setProviderFamily={setProviderFamily}
        />
        <PeriodSwitch period={period} setPeriod={setPeriod} />
        <button
          type="button"
          onClick={() => loadDashboard()}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-border bg-background/75 px-3 text-sm font-semibold transition hover:border-foreground/40"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          刷新
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {isLoading && !data ? (
        <LoadingState />
      ) : channels.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/70 bg-background/75 p-12 text-center text-sm text-muted-foreground">
          {(data?.channels ?? []).length === 0
            ? "暂无监控模型"
            : "当前筛选下没有匹配的模型"}
        </div>
      ) : (
        <div className="space-y-6">
          {channels.map((channel) => (
            <ChannelSection key={channel.id} channel={channel} period={period} />
          ))}
        </div>
      )}
    </section>
  );
}
