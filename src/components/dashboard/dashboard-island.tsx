"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ExternalLink,
  LayoutGrid,
  List,
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
import { ModelCollection, type ModelViewMode } from "./model-cards";
import { ThemeToggle } from "./theme-toggle";

const ALL_CHANNELS = "all";
const COLLAPSED_CHANNELS_STORAGE_KEY = "check-cx:collapsed-channels";
const VIEW_MODE_STORAGE_KEY = "check-cx:view-mode";

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

function readViewMode(): ModelViewMode {
  if (typeof window === "undefined") {
    return "grid";
  }
  const fromQuery = new URLSearchParams(window.location.search).get("view");
  if (fromQuery === "grid" || fromQuery === "list") {
    return fromQuery;
  }
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list"
      ? "list"
      : "grid";
  } catch {
    return "grid";
  }
}

function writeViewMode(mode: ModelViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // 存储不可用时视图偏好仅在本次会话生效
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

function statusRank(model: DashboardChannelModel) {
  const status = getEffectiveStatus(model);
  if (FAILURE_STATUSES.has(status)) {
    return 0;
  }
  if (status === "degraded") {
    return 1;
  }
  return status === "operational" ? 3 : 2;
}

function summarizeChannels(channels: DashboardChannel[]) {
  const total = { total: 0, operational: 0, degraded: 0, failed: 0 };
  for (const channel of channels) {
    const summary = summarizeChannel(channel);
    total.total += summary.total;
    total.operational += summary.operational;
    total.degraded += summary.degraded;
    total.failed += summary.failed;
  }
  return total;
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
    <div ref={rootRef} className="relative shrink-0 sm:min-w-[150px]">
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
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:inline">
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
        className="h-6 w-auto max-w-[120px] shrink-0 object-contain"
        src={channel.logoUrl}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
      <Activity className="h-3.5 w-3.5" />
    </div>
  );
}

const CHANNEL_LINK_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground";

// 渠道头部的健康比例条：正常 / 延迟 / 异常 按数量占比
function HealthMeter({ channel }: { channel: DashboardChannel }) {
  const summary = summarizeChannel(channel);
  if (summary.total === 0) {
    return null;
  }
  const other = summary.total - summary.operational - summary.degraded - summary.failed;
  const parts = [
    { key: "operational", count: summary.operational, className: "bg-emerald-500" },
    { key: "degraded", count: summary.degraded, className: "bg-amber-500" },
    { key: "failed", count: summary.failed, className: "bg-rose-500" },
    { key: "other", count: other, className: "bg-sky-500" },
  ].filter((part) => part.count > 0);

  return (
    <div
      aria-hidden="true"
      className="hidden h-1.5 w-24 gap-0.5 overflow-hidden rounded-full sm:flex"
    >
      {parts.map((part) => (
        <span
          key={part.key}
          className={cn("h-full first:rounded-l-full last:rounded-r-full", part.className)}
          style={{ flexGrow: part.count }}
        />
      ))}
    </div>
  );
}

function ChannelSection({
  channel,
  period,
  view,
  collapsed,
  onToggleCollapsed,
}: {
  channel: DashboardChannel;
  period: AvailabilityPeriod;
  view: ModelViewMode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const bodyId = `channel-body-${channel.id}`;

  return (
    <section
      id={`channel-${channel.id}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-xl dark:bg-white/[0.02]"
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3",
          !collapsed && "border-b border-border/60"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ChannelLogo channel={channel} />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="truncate text-base font-semibold tracking-[-0.01em]">
              {channel.name}
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatChannelSummary(channel)}
            </span>
          </div>
          <HealthMeter channel={channel} />
        </div>
        <div className="flex items-center gap-0.5">
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
        <div id={bodyId}>
          <ModelCollection models={channel.models} period={period} view={view} />
        </div>
      )}
    </section>
  );
}

function ViewModeSwitch({
  view,
  setView,
}: {
  view: ModelViewMode;
  setView: (view: ModelViewMode) => void;
}) {
  const options: Array<{ value: ModelViewMode; label: string; icon: typeof List }> = [
    { value: "grid", label: "卡片视图", icon: LayoutGrid },
    { value: "list", label: "列表视图", icon: List },
  ];
  return (
    <div
      role="group"
      aria-label="视图"
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-background/75 p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            title={option.label}
            onClick={() => setView(option.value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

// 顶部汇总：一眼看清全站健康，点击“异常”可只看有问题的模型
function SummaryStrip({
  channels,
  issuesOnly,
  onToggleIssuesOnly,
}: {
  channels: DashboardChannel[];
  issuesOnly: boolean;
  onToggleIssuesOnly: () => void;
}) {
  const summary = summarizeChannels(channels);
  const issues = summary.degraded + summary.failed;
  const items = [
    { label: "模型", value: summary.total, dot: null },
    { label: "正常", value: summary.operational, dot: "bg-emerald-500" },
    { label: "延迟", value: summary.degraded, dot: "bg-amber-500" },
    { label: "异常", value: summary.failed, dot: "bg-rose-500" },
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <dl className="flex min-w-0 flex-1 divide-x divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background/80 backdrop-blur-xl dark:bg-white/[0.02]">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 flex-1 px-3 py-2 sm:px-4">
            <dt className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              {item.dot && <span className={cn("h-1.5 w-1.5 rounded-full", item.dot)} />}
              {item.label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-6 tracking-tight">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        aria-pressed={issuesOnly}
        disabled={issues === 0 && !issuesOnly}
        onClick={onToggleIssuesOnly}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto",
          issuesOnly
            ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            : "border-border/70 bg-background/80 text-muted-foreground hover:border-foreground/25 hover:text-foreground dark:bg-white/[0.02]"
        )}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            issues > 0 ? "bg-rose-500" : "bg-emerald-500"
          )}
        />
        {issuesOnly ? "显示全部" : issues > 0 ? `只看异常 ${issues}` : "全部正常"}
      </button>
    </div>
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
    <nav aria-label="渠道筛选" className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {options.map((option) => {
        const isActive = option.id === activeChannel;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(option.id)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
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
    <div className="space-y-3">
      <div className="h-16 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border border-border/50 bg-muted/30"
          />
        ))}
      </div>
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
  const [view, setViewState] = useState<ModelViewMode>(readViewMode);
  const [issuesOnly, setIssuesOnly] = useState(false);
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
          .filter(
            (model) =>
              !issuesOnly || getEffectiveStatus(model) !== "operational"
          )
          // 有问题的模型排在前面，便于第一眼看到
          .sort(
            (left, right) =>
              statusRank(left) - statusRank(right) ||
              left.name.localeCompare(right.name)
          ),
      }))
      .filter((channel) => channel.models.length > 0);
  }, [activeProviderFamily, data, issuesOnly, query]);
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
  const setView = useCallback((mode: ModelViewMode) => {
    setViewState(mode);
    writeViewMode(mode);
  }, []);
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

  const allVisibleChannels = useMemo(
    () => (data?.channels ?? []).filter((channel) => channel.models.length > 0),
    [data]
  );
  const siteName = data?.site?.siteName ?? "Status";

  return (
    <section
      className="relative mx-auto flex w-full max-w-[2200px] flex-col gap-4"
      data-dashboard-ready={!isLoading && !errorMessage ? "true" : "false"}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          {data?.site?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={siteName}
              className="h-8 w-fit max-w-[160px] shrink-0 object-contain sm:h-9 dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5"
              src={data.site.logoUrl}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
              <Activity className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 border-l border-border pl-3">
            <h1 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-foreground">
              Status
            </h1>
            {data?.site?.description && (
              <p className="line-clamp-2 max-w-[60ch] text-xs text-muted-foreground">
                {data.site.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold",
              overallStatus === "unknown"
                ? "border-border bg-muted text-muted-foreground"
                : STATUS_PILL_CLASS[overallStatus]
            )}
          >
            <span className="relative flex h-2 w-2">
              {overallStatus === "operational" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  overallStatus === "unknown"
                    ? "bg-muted-foreground"
                    : STATUS_DOT_CLASS[overallStatus]
                )}
              />
            </span>
            {overallLabel}
          </span>
          <span className="hidden sm:inline">
            最近更新 <strong className="font-medium tabular-nums text-foreground">{formatTime(data?.lastUpdated)}</strong>
          </span>
          {countdown && (
            <span>
              下次检查 <strong className="font-medium tabular-nums text-foreground">{countdown}</strong>
            </span>
          )}
          {data?.site?.publicOrigin && (
            <a
              className="inline-flex items-center gap-1 font-medium text-foreground transition hover:opacity-70"
              href={data.site.publicOrigin}
              rel="noreferrer"
              target="_blank"
            >
              官网
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      {data && allVisibleChannels.length > 0 && (
        <SummaryStrip
          channels={allVisibleChannels}
          issuesOnly={issuesOnly}
          onToggleIssuesOnly={() => setIssuesOnly((value) => !value)}
        />
      )}

      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 [background:color-mix(in_oklab,var(--background)_82%,transparent)]">
        <div className="flex flex-wrap items-center gap-1.5">
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
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-none">
            <ProviderFamilySwitch
              families={providerFamilies}
              activeFamily={activeProviderFamily}
              setProviderFamily={setProviderFamily}
            />
            <PeriodSwitch period={period} setPeriod={setPeriod} />
            <ViewModeSwitch view={view} setView={setView} />
            <button
              type="button"
              aria-label="刷新"
              onClick={() => loadDashboard()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background/75 text-sm font-medium transition hover:border-foreground/40 sm:w-auto sm:px-3"
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
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {isLoading && !data ? (
        <LoadingState />
      ) : channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/75 p-12 text-center text-sm text-muted-foreground">
          {(data?.channels ?? []).length === 0
            ? "暂无监控模型"
            : issuesOnly
              ? "当前没有异常的模型"
              : "当前筛选下没有匹配的模型"}
        </div>
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <ChannelSection
              key={channel.id}
              channel={channel}
              period={period}
              view={view}
              collapsed={collapsedChannels.has(channel.id)}
              onToggleCollapsed={() => toggleChannelCollapsed(channel.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
