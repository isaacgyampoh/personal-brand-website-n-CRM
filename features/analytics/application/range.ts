import { addDaysToKey, dateKey, fromWallClock, parseDateKey } from "@/lib/time";

export type RangeKey = "7d" | "30d" | "90d" | "mtd" | "ytd" | "custom";
export type DateRange = { key: RangeKey; from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string };

const startOf = (key: string, tz: string) => {
  const { year, month, day } = parseDateKey(key);
  return fromWallClock({ year, month, day, hour: 0, minute: 0 }, tz);
};

/** Resolves a date-range filter in the business time zone, plus the equivalent previous period. */
export function resolveRange(sp: { range?: string; from?: string; to?: string }, tz: string, now = new Date()): DateRange {
  const today = dateKey(now, tz);
  const end = startOf(addDaysToKey(today, 1), tz);
  let key = (sp.range as RangeKey) ?? "30d";
  let fromKey: string;
  let toExclusive = end;
  if (key === "custom" && sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) {
    fromKey = sp.from;
    toExclusive = startOf(addDaysToKey(sp.to, 1), tz);
  } else if (key === "mtd") fromKey = `${today.slice(0, 8)}01`;
  else if (key === "ytd") fromKey = `${today.slice(0, 4)}-01-01`;
  else {
    const days = key === "7d" ? 7 : key === "90d" ? 90 : 30;
    if (!["7d", "30d", "90d"].includes(key)) key = "30d";
    fromKey = addDaysToKey(today, -(days - 1));
  }
  const from = startOf(fromKey, tz);
  const span = toExclusive.getTime() - from.getTime();
  const labels: Record<RangeKey, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", mtd: "Month to date", ytd: "Year to date", custom: "Custom range" };
  return { key, from, to: toExclusive, prevFrom: new Date(from.getTime() - span), prevTo: from, label: labels[key] };
}

export function growth(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
