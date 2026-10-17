import type {
  AvailabilityPeriod,
  DashboardChannelModel,
  HealthStatus,
} from "@/lib/types";

// 首页卡片与列表共用的常量、格式化与状态判定

export const PERIODS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d", label: "7 天" },
  { value: "15d", label: "15 天" },
  { value: "30d", label: "30 天" },
];
export const HISTORY_SEGMENT_COUNT = 60;
export const DEGRADED_THRESHOLD_MS = 30_000;

export const FAILURE_STATUSES = new Set<string>(["failed", "error", "validation_failed"]);

export const STATUS_LABEL: Record<string, string> = {
  operational: "正常",
  degraded: "延迟",
  failed: "异常",
  validation_failed: "验证失败",
  maintenance: "维护中",
  error: "错误",
};

export const STATUS_DOT_CLASS: Record<string, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  failed: "bg-rose-500",
  validation_failed: "bg-orange-500",
  maintenance: "bg-sky-500",
  error: "bg-red-600",
};

export const STATUS_PILL_CLASS: Record<string, string> = {
  operational: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  degraded: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  validation_failed: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  maintenance: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  error: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-300",
};

export const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Claude",
};

export function getProviderFamily(type: string) {
  return PROVIDER_LABEL[type] ?? type;
}

export function getProviderDisplayName(name: string) {
  return name.replace(/^SU8\s+/i, "");
}

export const latencyNumberFormatter = new Intl.NumberFormat("en-US");

export function formatLatency(value: number | null | undefined) {
  return typeof value === "number"
    ? `${latencyNumberFormatter.format(Math.round(value))} ms`
    : "—";
}

export const chinaTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const chinaClockFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatTime(value: string | null | undefined) {
  if (!value) {
    return "暂无数据";
  }
  return chinaTimeFormatter.format(new Date(value));
}

export function formatClock(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return chinaClockFormatter.format(new Date(value));
}

export function isSlowLatency(model: DashboardChannelModel) {
  return (
    typeof model.latencyMs === "number" && model.latencyMs > DEGRADED_THRESHOLD_MS
  );
}

// 正常/延迟以最新延迟为准，与状态胶囊配色保持一致
export function getEffectiveStatus(model: DashboardChannelModel): HealthStatus {
  if (
    (model.status === "operational" || model.status === "degraded") &&
    typeof model.latencyMs === "number"
  ) {
    return isSlowLatency(model) ? "degraded" : "operational";
  }
  return model.status;
}

export function getAvailabilityColor(pct: number | null | undefined) {
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

export function getModelStatusClasses(model: DashboardChannelModel) {
  if (
    (model.status === "operational" || model.status === "degraded") &&
    typeof model.latencyMs === "number"
  ) {
    const isSlow = isSlowLatency(model);
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

export function getPeriodLabel(period: AvailabilityPeriod) {
  return PERIODS.find((item) => item.value === period)?.label ?? period;
}
export function isIssueStatus(status: string) {
  return FAILURE_STATUSES.has(status);
}
