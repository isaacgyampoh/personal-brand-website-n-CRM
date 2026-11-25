"use client";

import { useState } from "react";
import { ActionForm, Submit } from "./forms";
import { saveHoursAction } from "@/features/bookings/presentation/admin-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Rule = { weekday: number; start_time: string; end_time: string };

export function HoursEditor({ serviceId, rules, allowGlobal = false }: { serviceId: string | null; rules: Rule[]; allowGlobal?: boolean }) {
  const [days, setDays] = useState(() =>
    DAYS.map((_, d) => {
      const r = rules.filter((x) => x.weekday === d);
      return { on: r.length > 0, ranges: r.length ? r.map((x) => ({ start: x.start_time, end: x.end_time })) : [{ start: "09:00", end: "17:00" }] };
    }),
  );
  const [useGlobal, setUseGlobal] = useState(allowGlobal && rules.length === 0);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <ActionForm action={saveHoursAction} success="Hours saved" className="space-y-3">
      {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}
      {allowGlobal && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="useGlobal" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} className="size-4" /> Use business working hours</label>
      )}
      <fieldset disabled={useGlobal} className={useGlobal ? "opacity-50" : ""}>
        <legend className="sr-only">Weekly hours</legend>
        <ul className="divide-y rounded-lg border">
          {order.map((d) => (
            <li key={d} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <label className="flex w-36 items-center gap-2 pt-1.5 text-sm font-medium">
                <input type="checkbox" name={`on-${d}`} checked={days[d].on} onChange={(e) => setDays(days.map((x, i) => (i === d ? { ...x, on: e.target.checked } : x)))} className="size-4" />
                {DAYS[d]}
              </label>
              {days[d].on ? (
                <div className="flex flex-1 flex-col gap-2">
                  {days[d].ranges.map((r, ri) => (
                    <div key={ri} className="flex items-center gap-2 text-sm">
                      <input type="time" name={`start-${d}`} defaultValue={r.start} className="h-9 rounded-md border px-2" aria-label={`${DAYS[d]} start`} />
                      <span>to</span>
                      <input type="time" name={`end-${d}`} defaultValue={r.end} className="h-9 rounded-md border px-2" aria-label={`${DAYS[d]} end`} />
                      {ri > 0 && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDays(days.map((x, i) => (i === d ? { ...x, ranges: x.ranges.filter((_, k) => k !== ri) } : x)))}>Remove</button>}
                    </div>
                  ))}
                  <button type="button" className="self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setDays(days.map((x, i) => (i === d ? { ...x, ranges: [...x.ranges, { start: "13:00", end: "17:00" }] } : x)))}>+ Add hours</button>
                </div>
              ) : <span className="pt-1.5 text-sm text-muted-foreground">Unavailable</span>}
            </li>
          ))}
        </ul>
      </fieldset>
      <Submit>Save hours</Submit>
    </ActionForm>
  );
}
