"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
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
} from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  FAILURE_STATUSES,
  PERIODS,
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  STATUS_PILL_CLASS,
  formatTime,
  getEffectiveStatus,
  getProviderFamily,
} from "./dashboard-shared";
import { ChannelModelRow } from "./model-cards";
import { ThemeToggle } from "./theme-toggle";

const ALL_CHANNELS = "all";
const COLLAPSED_CHANNELS_STORAGE_KEY = "check-cx:collapsed-channels";


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

function matchesModel(
  model: DashboardChannelModel,
  channelName: string,
  query: string
) {
  if (!query) {
    return true;
  }

  const target = [
    model.name,
    model.model,
    model.type,
    getProviderFamily(model.type),
    channelName,
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

function getInitialChannel() {
  if (typeof window === "undefined") {
    return ALL_CHANNELS;
  }
  return new URLSearchParams(window.location.search).get("channel") || ALL_CHANNELS;
}

// 只同步 URL，不触发页面刷新，方便分享指定渠道的链接
function syncChannelToUrl(channelId: string) {
  try {
    const url = new URL(window.location.href);
    if (channelId === ALL_CHANNELS) {
      url.searchParams.delete("channel");
    } else {
      url.searchParams.set("channel", channelId);
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    // URL 同步失败不影响筛选本身
  }
}

function readCollapsedChannels(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(COLLAPSED_CHANNELS_STORAGE_KEY) ?? "[]"
    ) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : []
    );
  } catch {
    return new Set();
  }
}

function writeCollapsedChannels(ids: Set<string>) {
  try {
    window.localStorage.setItem(
      COLLAPSED_CHANNELS_STORAGE_KEY,
      JSON.stringify([...ids])
    );
  } catch {
    // 存储不可用时折叠状态仅在本次会话生效
  }
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


function summarizeChannel(channel: DashboardChannel) {
  const summary = { total: channel.models.length, operational: 0, degraded: 0, failed: 0 };
  for (const model of channel.models) {
    const status = getEffectiveStatus(model);
    if (status === "operational") {
      summary.operational += 1;
    } else if (status === "degraded") {
      summary.degraded += 1;
    } else if (FAILURE_STATUSES.has(status)) {
      summary.failed += 1;
    }
  }
  return summary;
}

function formatChannelSummary(channel: DashboardChannel) {
  const summary = summarizeChannel(channel);
  const parts = [
    `${summary.total} 个模型`,
    `${summary.operational} 正常`,
    `${summary.failed} 异常`,
  ];
  if (summary.degraded > 0) {
    parts.push(`${summary.degraded} 延迟`);
  }
  return parts.join(" · ");
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
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:min-w-[150px] sm:flex-none">
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




function ChannelLogo({ channel }: { channel: DashboardChannel }) {
  const [failed, setFailed] = useState(false);

  if (channel.logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${channel.name} logo`}
        className="h-8 w-auto max-w-[160px] shrink-0 object-contain"
        src={channel.logoUrl}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
      <Activity className="h-4 w-4" />
    </div>
  );
}

const CHANNEL_LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground";

function ChannelSection({
  channel,
  period,
  collapsed,
  onToggleCollapsed,
}: {
  channel: DashboardChannel;
  period: AvailabilityPeriod;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const bodyId = `channel-body-${channel.id}`;

  return (
    <section
      id={`channel-${channel.id}`}
      className="scroll-mt-6 rounded-3xl border border-border/55 bg-background/45 p-4 shadow-sm backdrop-blur-xl sm:p-5"
    >
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          !collapsed && "mb-5"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ChannelLogo channel={channel} />
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black tracking-tight">
              {channel.name}
            </h2>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatChannelSummary(channel)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {channel.websiteUrl && (
            <a
              className={CHANNEL_LINK_CLASS}
              href={channel.websiteUrl}
              rel="noreferrer"
              target="_blank"
            >
              官网
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {channel.statusPageUrl && (
            <a
              className={CHANNEL_LINK_CLASS}
              href={channel.statusPageUrl}
              rel="noreferrer"
              target="_blank"
            >
              官方状态页
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={`${collapsed ? "展开" : "折叠"} ${channel.name}`}
            onClick={onToggleCollapsed}
            className={CHANNEL_LINK_CLASS}
          >
            {collapsed ? "展开" : "折叠"}
            <ChevronDown
              className={cn("h-3 w-3 transition", !collapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div id={bodyId} className="space-y-3">
          {channel.models.map((model) => (
            <ChannelModelRow key={model.id} model={model} period={period} />
          ))}
        </div>
      )}
    </section>
  );
}

interface ChannelChipOption {
  id: string;
  name: string;
  count: number | null;
  status: HealthStatus | "unknown" | null;
}

function ChannelChips({
  channels,
  activeChannel,
  onSelect,
}: {
  channels: DashboardChannel[];
  activeChannel: string;
  onSelect: (channelId: string) => void;
}) {
  const options: ChannelChipOption[] = [
    { id: ALL_CHANNELS, name: "全部渠道", count: null, status: null },
    ...channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      count: channel.models.length,
      status: getOverallChannelStatus([channel]),
    })),
  ];

  return (
    <nav aria-label="渠道筛选" className="-mt-4 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isActive = option.id === activeChannel;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(option.id)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-background/75 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
            )}
          >
            {option.status && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  option.status === "unknown"
                    ? "bg-muted-foreground"
                    : STATUS_DOT_CLASS[option.status]
                )}
              />
            )}
            <span>{option.name}</span>
            {option.count !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  isActive ? "text-background/70" : "text-muted-foreground/80"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
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
  const [activeChannel, setActiveChannel] = useState(getInitialChannel);
  const [collapsedChannels, setCollapsedChannels] = useState<Set<string>>(
    readCollapsedChannels
  );
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
  const filteredChannels = useMemo(() => {
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
          .filter((model) => matchesModel(model, channel.name, query))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .filter((channel) => channel.models.length > 0);
  }, [activeProviderFamily, data, query]);
  // 指定的渠道不在当前结果中时（被筛掉或已下线）回退为全部渠道
  const effectiveChannel = filteredChannels.some(
    (channel) => channel.id === activeChannel
  )
    ? activeChannel
    : ALL_CHANNELS;
  const channels =
    effectiveChannel === ALL_CHANNELS
      ? filteredChannels
      : filteredChannels.filter((channel) => channel.id === effectiveChannel);
  const selectChannel = useCallback((channelId: string) => {
    setActiveChannel(channelId);
    syncChannelToUrl(channelId);
  }, []);
  const toggleChannelCollapsed = useCallback((channelId: string) => {
    setCollapsedChannels((previous) => {
      const next = new Set(previous);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      writeCollapsedChannels(next);
      return next;
    });
  }, []);
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
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {data?.site?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={data.site.siteName}
                  className="h-9 w-fit max-w-[180px] shrink-0 object-contain sm:h-12 sm:max-w-[210px] dark:rounded-lg dark:bg-white dark:px-2 dark:py-1"
                  src={data.site.logoUrl}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                  <Activity className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1 basis-[180px] border-l border-border pl-3">
                <h1 className="text-2xl font-black leading-none tracking-[-0.045em] text-foreground sm:text-3xl">
                  Status
                </h1>
                {data?.site?.description && (
                  <p className="mt-1 line-clamp-2 max-w-[52ch] text-xs text-muted-foreground sm:text-sm">
                    {data.site.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
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
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/55 bg-background/45 p-2">
        <label className="relative block w-full sm:w-auto sm:min-w-[220px] sm:flex-[1_1_280px]">
          <span className="sr-only">搜索模型、类型或渠道</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="provider-search"
            name="provider-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型、类型或渠道"
            className="h-8 w-full rounded-full border border-border bg-background/75 pl-8 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <ProviderFamilySwitch
            families={providerFamilies}
            activeFamily={activeProviderFamily}
            setProviderFamily={setProviderFamily}
          />
          <PeriodSwitch period={period} setPeriod={setPeriod} />
          <button
            type="button"
            aria-label="刷新"
            onClick={() => loadDashboard()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background/75 text-sm font-semibold transition hover:border-foreground/40 sm:w-auto sm:px-3"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">刷新</span>
          </button>
        </div>
      </div>

      {filteredChannels.length > 1 && (
        <ChannelChips
          channels={filteredChannels}
          activeChannel={effectiveChannel}
          onSelect={selectChannel}
        />
      )}

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
            <ChannelSection
              key={channel.id}
              channel={channel}
              period={period}
              collapsed={collapsedChannels.has(channel.id)}
              onToggleCollapsed={() => toggleChannelCollapsed(channel.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
