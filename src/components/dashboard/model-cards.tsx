"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import type {
  AvailabilityPeriod,
  DashboardChannelModel,
  TimelineItem,
} from "@/lib/types";
import { ModelIcon } from "@/components/model-icon";
import { cn } from "@/lib/utils";

import {
  HISTORY_LEGEND,
  HISTORY_SEGMENT_COUNT,
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  formatDuration,
  formatHistoryStart,
  formatLatency,
  formatTime,
  getAvailabilityColor,
  getEffectiveStatus,
  getHistorySpanMs,
  getModelStatusClasses,
  getPeriodLabel,
  getProviderDisplayName,
  isIssueStatus,
  isSlowLatency,
} from "./dashboard-shared";

export type ModelViewMode = "grid" | "list";

// 色带下方的说明行：起止时间刻度 + 当前点选格子的详情
function HistoryCaption({
  items,
  selected,
}: {
  items: TimelineItem[];
  selected: TimelineItem | null;
}) {
  if (selected) {
    return (
      <p
        aria-live="polite"
        className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-foreground/80"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            STATUS_DOT_CLASS[selected.status] ?? "bg-muted-foreground"
          )}
        />
        <span className="truncate tabular-nums">
          {formatTime(selected.checkedAt)} · {STATUS_LABEL[selected.status] ?? selected.status} · {formatLatency(selected.latencyMs)}
        </span>
      </p>
    );
  }

  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, HISTORY_SEGMENT_COUNT);
  const spanMs = getHistorySpanMs(visible);
  return (
    <p className="flex items-center justify-between gap-2 text-[10px] leading-4 tabular-nums text-muted-foreground">
      <time dateTime={visible[visible.length - 1].checkedAt}>
        {formatHistoryStart(visible[visible.length - 1].checkedAt, spanMs)}
      </time>
      <span className="truncate">
        {`最近 ${visible.length} 次检查${spanMs > 0 ? ` · ${formatDuration(spanMs)}` : ""}`}
      </span>
      <time dateTime={visible[0].checkedAt}>
        {formatHistoryStart(visible[0].checkedAt, spanMs)}
      </time>
    </p>
  );
}

export function StatusHistory({
  items,
  className,
  barClassName,
  showCaption = true,
}: {
  items: TimelineItem[];
  className?: string;
  barClassName?: string;
  showCaption?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const segments = Array.from(
    { length: HISTORY_SEGMENT_COUNT },
    (_, index) => items[index] ?? null
  );
  const selected = selectedIndex === null ? null : items[selectedIndex] ?? null;

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div
        role="list"
        aria-label={`最近 ${Math.min(items.length, HISTORY_SEGMENT_COUNT)} 次检查，左旧右新`}
        className={cn("flex flex-row-reverse gap-px", barClassName)}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            setSelectedIndex(null);
          }
        }}
      >
        {segments.map((segment, index) => {
          const label = segment
            ? `${formatTime(segment.checkedAt)} · ${STATUS_LABEL[segment.status] ?? segment.status} · ${formatLatency(segment.latencyMs)}`
            : "暂无数据";
          return (
            <span
              key={segment ? `${segment.id}-${segment.checkedAt}` : `empty-${index}`}
              role="listitem"
              aria-label={label}
              title={label}
              // 悬停只响应鼠标；触屏点按会先模拟一次移入，交给 click 统一处理
              onPointerEnter={
                segment
                  ? (event) => {
                      if (event.pointerType === "mouse") {
                        setSelectedIndex(index);
                      }
                    }
                  : undefined
              }
              onClick={segment ? () => setSelectedIndex(index) : undefined}
              className={cn(
                "min-w-0 flex-1 rounded-[1.5px] transition-opacity",
                segment
                  ? cn(
                      STATUS_DOT_CLASS[segment.status] ?? "bg-muted-foreground",
                      "cursor-pointer",
                      selectedIndex !== null && selectedIndex !== index && "opacity-40"
                    )
                  : "bg-foreground/[0.06]"
              )}
            />
          );
        })}
      </div>
      {showCaption && <HistoryCaption items={items} selected={selected} />}
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
  model,
  className,
}: {
  model: DashboardChannelModel;
  className?: string;
}) {
  return (
    <span
      aria-label={`${model.model} 模型图标`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] ring-1 ring-inset ring-foreground/[0.08]",
        className
      )}
    >
      <ModelIcon model={model.model} size={15} className="text-foreground/75" />
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
        <ProviderMark model={model} className="mt-0.5 h-7 w-7" />
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

      <StatusHistory items={historyToTimelineItems(model)} barClassName="h-6" />

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
        <span
          title={`最近检查 ${formatTime(model.checkedAt)}`}
          className="flex items-baseline gap-1.5 text-muted-foreground"
        >
          <span>延迟</span>
          <LatencyValue model={model} />
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
        <ProviderMark model={model} className="h-6 w-6" />
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
        className="order-last col-span-2 md:order-none md:col-span-1"
        barClassName="h-4 md:h-5"
        showCaption={false}
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
        <span
          title={`最近检查 ${formatTime(model.checkedAt)}`}
          className="hidden w-16 text-right sm:block"
        >
          <LatencyValue model={model} />
        </span>
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

export function HistoryLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="色带图例"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      {HISTORY_LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-1.5 rounded-[1.5px]", item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// 列表视图共用一条时间说明，避免每行重复
function ListHistoryCaption({ models }: { models: DashboardChannelModel[] }) {
  const history = models.flatMap((model) => model.history.slice(0, HISTORY_SEGMENT_COUNT));
  if (history.length === 0) {
    return null;
  }
  const spanMs = getHistorySpanMs(history);
  return (
    <p className="px-3 pb-2 pt-1 text-right text-[10px] tabular-nums text-muted-foreground">
      {`色带为每个模型最近 ${HISTORY_SEGMENT_COUNT} 次检查，左旧右新${spanMs > 0 ? `，覆盖${formatDuration(spanMs)}` : ""}`}
    </p>
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
      <div>
        <div className="divide-y divide-border/50">
          {models.map((model) => (
            <ModelListRow key={model.id} model={model} period={period} />
          ))}
        </div>
        <ListHistoryCaption models={models} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5 p-2.5">
      {models.map((model) => (
        <ModelTile key={model.id} model={model} period={period} />
      ))}
    </div>
  );
}
