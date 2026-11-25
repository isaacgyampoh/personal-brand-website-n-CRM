/**
 * Time-zone helpers built on Intl (no dependencies). All storage is UTC; these
 * convert between UTC instants and wall-clock time in an IANA zone.
 */

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of a UTC instant in `tz`. */
export function toWallClock(date: Date, tz: string): WallClock & { weekday: number } {
  const parts = Object.fromEntries(fmt(tz).formatToParts(date).map((p) => [p.type, p.value]));
  const wc = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
  const weekday = new Date(Date.UTC(wc.year, wc.month - 1, wc.day)).getUTCDay();
  return { ...wc, weekday };
}

/** Offset (ms) of `tz` from UTC at instant `date`. */
function offsetAt(date: Date, tz: string): number {
  const wc = toWallClock(date, tz);
  const asUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, date.getUTCSeconds());
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * UTC instant for a wall-clock time in `tz`. For non-existent times (DST gap)
 * the result is shifted forward; for ambiguous times the earlier is returned.
 */
export function fromWallClock(wc: WallClock, tz: string): Date {
  const naive = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute);
  let guess = naive - offsetAt(new Date(naive), tz);
  const second = naive - offsetAt(new Date(guess), tz);
  if (second !== guess) guess = Math.min(guess, second);
  return new Date(guess);
}

/** "YYYY-MM-DD" for the calendar date of `date` in `tz`. */
export function dateKey(date: Date, tz: string): string {
  const wc = toWallClock(date, tz);
  return `${wc.year}-${String(wc.month).padStart(2, "0")}-${String(wc.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error("Invalid date");
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h, minute: m };
}

export function formatInZone(date: Date, tz: string, opts: Intl.DateTimeFormatOptions = {}, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(date);
}

export function formatDateTime(date: Date | string, tz: string): string {
  return formatInZone(new Date(date), tz, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDate(date: Date | string, tz: string): string {
  return formatInZone(new Date(date), tz, { day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(date: Date | string, tz: string): string {
  return formatInZone(new Date(date), tz, { hour: "2-digit", minute: "2-digit" });
}
