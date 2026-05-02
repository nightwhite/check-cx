"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";

import type { AvailabilityPeriod, DashboardData, ProviderTimeline } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIODS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d", label: "7 天" },
  { value: "15d", label: "15 天" },
  { value: "30d", label: "30 天" },
];

const STATUS_LABEL: Record<string, string> = {
  operational: "正常",
  degraded: "降级",
  failed: "失败",
  validation_failed: "校验失败",
  maintenance: "维护中",
  error: "错误",
};

const STATUS_CLASS: Record<string, string> = {
  operational: "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  degraded: "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
  failed: "border-red-500/30 bg-red-500/8 text-red-700 dark:text-red-300",
  validation_failed: "border-orange-500/30 bg-orange-500/8 text-orange-700 dark:text-orange-300",
  maintenance: "border-sky-500/30 bg-sky-500/8 text-sky-700 dark:text-sky-300",
  error: "border-red-500/30 bg-red-500/8 text-red-700 dark:text-red-300",
};

function formatLatency(value: number | null | undefined) {
  return typeof value === "number" ? `${value} ms` : "—";
}

function getGroups(data: DashboardData | null) {
  const groups = new Set<string>();
  for (const timeline of data?.providerTimelines ?? []) {
    if (timeline.latest.groupName) {
      groups.add(timeline.latest.groupName);
    }
  }
  return [...groups].sort((left, right) => left.localeCompare(right));
}

function matchesSearch(timeline: ProviderTimeline, query: string) {
  if (!query) {
    return true;
  }

  const target = [
    timeline.latest.name,
    timeline.latest.model,
    timeline.latest.type,
    timeline.latest.endpoint,
    timeline.latest.groupName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return target.includes(query.toLowerCase());
}

export function DashboardIsland() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<AvailabilityPeriod>("7d");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/dashboard?trendPeriod=${period}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Dashboard request failed: ${response.status}`);
      }
      const nextData = (await response.json()) as DashboardData;
      setData(nextData);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadDashboard().catch(() => undefined);
  }, [loadDashboard]);

  const groups = useMemo(() => getGroups(data), [data]);
  const timelines = useMemo(() => {
    return (data?.providerTimelines ?? [])
      .filter((timeline) => group === "all" || timeline.latest.groupName === group)
      .filter((timeline) => matchesSearch(timeline, query))
      .sort((left, right) => left.latest.name.localeCompare(right.latest.name));
  }, [data, group, query]);
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const timeline of data?.providerTimelines ?? []) {
      counts.set(timeline.latest.status, (counts.get(timeline.latest.status) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-background/85 p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Check CX</div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            AI Provider 状态
          </h1>
          <div className="text-sm text-muted-foreground">
            {data?.lastUpdated
              ? `更新时间 ${new Date(data.lastUpdated).toLocaleString()}`
              : "等待第一份健康检查快照"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadDashboard()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:border-foreground/40"
        >
          <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          刷新
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="provider-search"
            name="provider-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Provider、模型、端点或分组"
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </label>
        <select
          id="group-filter"
          name="group-filter"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none"
        >
          <option value="all">全部分组</option>
          {groups.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="inline-flex h-10 rounded-md border border-border bg-background p-1">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              className={cn(
                "rounded px-3 text-sm transition",
                period === item.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["operational", "degraded", "failed", "maintenance"].map((status) => (
          <div
            key={status}
            className="rounded-lg border border-border/70 bg-background/80 p-4"
          >
            <div className="text-xs text-muted-foreground">
              {STATUS_LABEL[status]}
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {summary.get(status) ?? 0}
            </div>
          </div>
        ))}
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/8 p-4 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {isLoading && !data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-lg border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : timelines.length === 0 ? (
        <div className="rounded-lg border border-border/70 bg-background/80 p-8 text-center text-sm text-muted-foreground">
          暂无匹配的健康检查快照
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {timelines.map((timeline) => {
            const latest = timeline.latest;
            return (
              <article
                key={timeline.id}
                className="flex min-h-40 flex-col gap-4 rounded-lg border border-border/70 bg-background/85 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {latest.name}
                    </h2>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {latest.type} / {latest.model}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
                      STATUS_CLASS[latest.status] ?? STATUS_CLASS.error
                    )}
                  >
                    {STATUS_LABEL[latest.status] ?? latest.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">首字延迟</div>
                    <div className="mt-1 font-medium">
                      {formatLatency(latest.latencyMs)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ping</div>
                    <div className="mt-1 font-medium">
                      {formatLatency(latest.pingLatencyMs)}
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{latest.groupName ?? "未分组"}</span>
                  <span>{new Date(latest.checkedAt).toLocaleTimeString()}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
