"use client";

import { AlertTriangle } from "lucide-react";

import type {
  AvailabilityPeriod,
  DashboardChannelModel,
  TimelineItem,
} from "@/lib/types";
import { ProviderIcon } from "@/components/provider-icon";
import { cn } from "@/lib/utils";

import {
  HISTORY_SEGMENT_COUNT,
  PROVIDER_LABEL,
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  formatClock,
  formatLatency,
  formatTime,
  getAvailabilityColor,
  getModelStatusClasses,
  getPeriodLabel,
  getProviderDisplayName,
  isSlowLatency,
} from "./dashboard-shared";

export function StatusHistory({ items }: { items: TimelineItem[] }) {
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

export function historyToTimelineItems(
  model: DashboardChannelModel
): TimelineItem[] {
  return model.history.map((item) => ({
    id: model.id,
    name: model.name,
    type: model.type,
    model: model.model,
    status: item.status,
    latencyMs: item.latencyMs,
    pingLatencyMs: null,
    checkedAt: item.checkedAt,
    message: "",
  }));
}

export function ChannelModelRow({
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
  const hasLatency = typeof model.latencyMs === "number";

  return (
    <article className="group rounded-2xl border border-border/45 bg-background/65 p-4 shadow-sm transition hover:border-foreground/20 hover:shadow-lg hover:shadow-foreground/5">
      {shouldShowOfficialStatus && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>官方状态：{officialStatusMessage}</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.6fr)] lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
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

          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold",
                statusClasses.pill
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", statusClasses.dot)} />
              {STATUS_LABEL[model.status] ?? model.status}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                data-testid="model-latency"
                className={cn(
                  "font-mono font-bold tabular-nums",
                  hasLatency
                    ? isSlowLatency(model)
                      ? "text-amber-600 dark:text-amber-300"
                      : "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {formatLatency(model.latencyMs)}
              </span>
              <span aria-hidden="true">·</span>
              <time
                dateTime={model.checkedAt}
                title={`最近检查 ${formatTime(model.checkedAt)}`}
                className="tabular-nums"
              >
                {formatClock(model.checkedAt)}
              </time>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              近 {getPeriodLabel(period)}可用性
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
