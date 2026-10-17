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
  getEffectiveStatus,
  getModelStatusClasses,
  getPeriodLabel,
  getProviderDisplayName,
  isIssueStatus,
  isSlowLatency,
} from "./dashboard-shared";

export type ModelViewMode = "grid" | "list";

export function StatusHistory({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  const segments = Array.from(
    { length: HISTORY_SEGMENT_COUNT },
    (_, index) => items[index] ?? null
  );

  return (
    <div className={cn("min-w-0", className)}>
      <span className="sr-only">
        最近 {Math.min(items.length, HISTORY_SEGMENT_COUNT)} 次检查
      </span>
      <div className="flex h-full flex-row-reverse gap-px">
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
              "min-w-0 flex-1 rounded-[1.5px] transition-opacity hover:opacity-70",
              segment
                ? STATUS_DOT_CLASS[segment.status] ?? "bg-muted-foreground"
                : "bg-foreground/[0.06]"
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

function StatusBadge({ model }: { model: DashboardChannelModel }) {
  const classes = getModelStatusClasses(model);
  return (
    <span
      data-testid="model-status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4",
        classes.pill
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", classes.dot)} />
      {STATUS_LABEL[getEffectiveStatus(model)] ?? model.status}
    </span>
  );
}

function ProviderMark({
  type,
  className,
}: {
  type: DashboardChannelModel["type"];
  className?: string;
}) {
  return (
    <span
      aria-label={`${PROVIDER_LABEL[type] ?? type} provider`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] ring-1 ring-inset ring-foreground/[0.08]",
        className
      )}
    >
      <ProviderIcon type={type} size={15} className="text-foreground/75" />
    </span>
  );
}

function LatencyValue({ model }: { model: DashboardChannelModel }) {
  const hasLatency = typeof model.latencyMs === "number";
  return (
    <span
      data-testid="model-latency"
      className={cn(
        "font-mono tabular-nums",
        hasLatency
          ? isSlowLatency(model)
            ? "text-amber-600 dark:text-amber-300"
            : "text-foreground/80"
          : "text-muted-foreground"
      )}
    >
      {formatLatency(model.latencyMs)}
    </span>
  );
}

function ModelNotes({ model }: { model: DashboardChannelModel }) {
  const officialStatusMessage = model.officialStatus?.message;
  const showOfficial = model.status !== "operational" && Boolean(officialStatusMessage);
  const showMessage = Boolean(model.message) && model.message !== "OK";
  if (!showOfficial && !showMessage) {
    return null;
  }

  return (
    <div className="space-y-1 text-[11px] leading-4">
      {showMessage && (
        <p
          title={model.message}
          className={cn(
            "truncate",
            isIssueStatus(getEffectiveStatus(model))
              ? "text-rose-600/90 dark:text-rose-300/90"
              : "text-muted-foreground"
          )}
        >
          {model.message}
        </p>
      )}
      {showOfficial && (
        <p
          title={officialStatusMessage}
          className="flex items-center gap-1 truncate text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">官方状态：{officialStatusMessage}</span>
        </p>
      )}
    </div>
  );
}

function issueSurface(model: DashboardChannelModel) {
  const status = getEffectiveStatus(model);
  if (status === "degraded") {
    return "border-amber-500/30 bg-amber-500/[0.03]";
  }
  if (isIssueStatus(status)) {
    return "border-rose-500/35 bg-rose-500/[0.035]";
  }
  return "border-border/60 bg-background/70 dark:bg-white/[0.015]";
}

export function ModelTile({
  model,
  period,
}: {
  model: DashboardChannelModel;
  period: AvailabilityPeriod;
}) {
  const availabilityPct = model.availability[period] ?? null;

  return (
    <article
      className={cn(
        "group flex min-w-0 flex-col gap-3 rounded-xl border p-3.5 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[0_6px_24px_-12px_rgb(0_0_0/0.18)]",
        issueSurface(model)
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ProviderMark type={model.type} className="mt-0.5 h-7 w-7" />
        <div className="min-w-0 flex-1">
          <h3
            title={getProviderDisplayName(model.name)}
            className="truncate text-sm font-semibold leading-5 tracking-[-0.01em]"
          >
            {getProviderDisplayName(model.name)}
          </h3>
          <p className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
            {model.model}
          </p>
        </div>
        <StatusBadge model={model} />
      </div>

      <StatusHistory items={historyToTimelineItems(model)} className="h-6" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] leading-4">
        <span className="flex items-baseline gap-1.5">
          <strong
            className={cn(
              "text-[13px] font-semibold tabular-nums",
              getAvailabilityColor(availabilityPct)
            )}
          >
            {availabilityPct === null ? "—" : `${availabilityPct.toFixed(2)}%`}
          </strong>
          <span className="text-muted-foreground">
            近 {getPeriodLabel(period)}可用性
          </span>
        </span>
        <span className="flex items-baseline gap-1.5 text-muted-foreground">
          <LatencyValue model={model} />
          <span aria-hidden="true">·</span>
          <time
            dateTime={model.checkedAt}
            title={`最近检查 ${formatTime(model.checkedAt)}`}
            className="tabular-nums"
          >
            {formatClock(model.checkedAt)}
          </time>
        </span>
      </div>

      <ModelNotes model={model} />
    </article>
  );
}

export function ModelListRow({
  model,
  period,
}: {
  model: DashboardChannelModel;
  period: AvailabilityPeriod;
}) {
  const availabilityPct = model.availability[period] ?? null;
  const issue = isIssueStatus(getEffectiveStatus(model));

  return (
    <article
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 transition-colors hover:bg-foreground/[0.025] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]",
        issue && "bg-rose-500/[0.03]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ProviderMark type={model.type} className="h-6 w-6" />
        <div className="min-w-0">
          <h3
            title={getProviderDisplayName(model.name)}
            className="truncate text-[13px] font-semibold leading-5"
          >
            {getProviderDisplayName(model.name)}
          </h3>
          <p className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
            {model.model}
          </p>
        </div>
      </div>

      <StatusHistory
        items={historyToTimelineItems(model)}
        className="order-last col-span-2 h-4 md:order-none md:col-span-1 md:h-5"
      />

      <div className="flex items-center justify-end gap-3 text-[11px] leading-4">
        <strong
          title={`近 ${getPeriodLabel(period)}可用性`}
          className={cn(
            "w-14 text-right text-[12px] font-semibold tabular-nums",
            getAvailabilityColor(availabilityPct)
          )}
        >
          {availabilityPct === null ? "—" : `${availabilityPct.toFixed(2)}%`}
        </strong>
        <span className="hidden w-16 text-right sm:block">
          <LatencyValue model={model} />
        </span>
        <time
          dateTime={model.checkedAt}
          title={`最近检查 ${formatTime(model.checkedAt)}`}
          className="hidden w-14 text-right tabular-nums text-muted-foreground lg:block"
        >
          {formatClock(model.checkedAt)}
        </time>
        <StatusBadge model={model} />
      </div>

      {issue && model.message && model.message !== "OK" && (
        <p
          title={model.message}
          className="col-span-full truncate text-[11px] leading-4 text-rose-600/90 dark:text-rose-300/90"
        >
          {model.message}
        </p>
      )}
    </article>
  );
}

export function ModelCollection({
  models,
  period,
  view,
}: {
  models: DashboardChannelModel[];
  period: AvailabilityPeriod;
  view: ModelViewMode;
}) {
  if (view === "list") {
    return (
      <div className="divide-y divide-border/50">
        {models.map((model) => (
          <ModelListRow key={model.id} model={model} period={period} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 p-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {models.map((model) => (
        <ModelTile key={model.id} model={model} period={period} />
      ))}
    </div>
  );
}
