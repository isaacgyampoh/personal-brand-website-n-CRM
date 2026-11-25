import { addDaysToKey, dateKey, fromWallClock, parseDateKey, parseTime } from "@/lib/time";

export type ServiceRules = {
  id: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  capacity: number;
};

export type WeeklyRule = { weekday: number; start: string; end: string };
export type Range = { start: Date; end: Date };
export type Exception = Range & { kind: "blocked" | "holiday" | "extra_hours" };
export type Busy = Range & { slotGroup: string; serviceId: string | null };
export type Slot = { start: Date; end: Date; remaining: number };

const MIN = 60_000;
const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

export function groupSlotKey(serviceId: string, start: Date): string {
  return `svc:${serviceId}:${start.toISOString()}`;
}

/** The range an appointment occupies on the calendar, including buffers. */
export function blockRange(service: Pick<ServiceRules, "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">, start: Date): Range {
  return {
    start: new Date(start.getTime() - service.bufferBeforeMinutes * MIN),
    end: new Date(start.getTime() + (service.durationMinutes + service.bufferAfterMinutes) * MIN),
  };
}

/** Working windows for one business-local calendar day. */
export function dayWindows(day: string, tz: string, rules: WeeklyRule[], exceptions: Exception[]): Range[] {
  const { year, month, day: d } = parseDateKey(day);
  const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  const windows: Range[] = rules
    .filter((r) => r.weekday === weekday)
    .map((r) => {
      const s = parseTime(r.start);
      const e = parseTime(r.end);
      return {
        start: fromWallClock({ year, month, day: d, hour: s.hour, minute: s.minute }, tz),
        end: fromWallClock({ year, month, day: d, hour: e.hour, minute: e.minute }, tz),
      };
    });
  const dayStart = fromWallClock({ year, month, day: d, hour: 0, minute: 0 }, tz);
  const next = parseDateKey(addDaysToKey(day, 1));
  const dayEnd = fromWallClock({ ...next, hour: 0, minute: 0 }, tz);
  for (const ex of exceptions) {
    if (ex.kind !== "extra_hours") continue;
    const s = new Date(Math.max(ex.start.getTime(), dayStart.getTime()));
    const e = new Date(Math.min(ex.end.getTime(), dayEnd.getTime()));
    if (e > s) windows.push({ start: s, end: e });
  }
  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Computes bookable slots for a business-local day. Pure function: the same
 * inputs always produce the same slots. The database exclusion constraint is
 * the final guard against races; this only decides what to offer.
 */
export function computeSlots(input: {
  day: string;
  tz: string;
  now: Date;
  service: ServiceRules;
  rules: WeeklyRule[];
  exceptions: Exception[];
  busy: Busy[];
  /** Appointment being rescheduled: its own range is ignored. */
  ignoreSlotGroup?: string;
}): Slot[] {
  const { service, now } = input;
  const earliest = new Date(now.getTime() + service.minNoticeMinutes * MIN);
  const latest = new Date(now.getTime() + service.maxAdvanceDays * 1440 * MIN);
  const blocked = input.exceptions.filter((e) => e.kind !== "extra_hours");
  const seen = new Set<number>();
  const slots: Slot[] = [];

  for (const w of dayWindows(input.day, input.tz, input.rules, input.exceptions)) {
    for (let t = w.start.getTime(); t + service.durationMinutes * MIN <= w.end.getTime(); t += service.slotIntervalMinutes * MIN) {
      if (seen.has(t)) continue;
      const start = new Date(t);
      if (start < earliest || start > latest) continue;
      if (dateKey(start, input.tz) !== input.day) continue;
      const appt: Range = { start, end: new Date(t + service.durationMinutes * MIN) };
      const block = blockRange(service, start);
      if (blocked.some((b) => overlaps(block, b))) continue;

      const groupKey = service.capacity > 1 ? groupSlotKey(service.id, start) : null;
      let taken = 0;
      let conflict = false;
      for (const b of input.busy) {
        if (input.ignoreSlotGroup && b.slotGroup === input.ignoreSlotGroup) continue;
        if (!overlaps(block, b)) continue;
        if (groupKey && b.slotGroup === groupKey) taken++;
        else { conflict = true; break; }
      }
      if (conflict) continue;
      const remaining = service.capacity - taken;
      if (remaining <= 0) continue;
      seen.add(t);
      slots.push({ start: appt.start, end: appt.end, remaining });
    }
  }
  return slots;
}

/** Whether a customer may still cancel/reschedule themselves. */
export function withinCustomerCutoff(startsAt: Date, cutoffHours: number, now = new Date()): boolean {
  return startsAt.getTime() - now.getTime() >= cutoffHours * 3600_000;
}
