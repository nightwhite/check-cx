export type TrendPeriod = "7d" | "15d" | "30d";

export const VALID_TREND_PERIODS: TrendPeriod[] = ["7d", "15d", "30d"];

export function parseTrendPeriod(value: string | null): TrendPeriod | null {
  if (value === null || value === "") {
    return "7d";
  }

  return VALID_TREND_PERIODS.includes(value as TrendPeriod)
    ? (value as TrendPeriod)
    : null;
}
