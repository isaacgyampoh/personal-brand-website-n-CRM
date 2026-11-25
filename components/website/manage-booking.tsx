"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelByTokenAction, rescheduleByTokenAction } from "@/features/bookings/presentation/manage-actions";
import { bookingDaysAction, bookingSlotsAction } from "@/features/website/presentation/public-actions";

export function ManageBooking(props: { token: string; serviceSlug: string; canCancel: boolean; canReschedule: boolean; cancelCutoff: number; policy: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">("idle");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const openReschedule = () => {
    setMode("reschedule");
    const d = new Date();
    bookingDaysAction(props.serviceSlug, d.toISOString().slice(0, 10)).then((r) => r.ok && setDays(r.data ?? []));
  };

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-10">
      {msg && <p role="status" className={`mb-6 border-l-2 px-4 py-3 text-sm ${msg.ok ? "border-green-700 bg-green-50 text-green-900" : "border-red-700 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-4">
          <button className="btn btn-primary" disabled={!props.canReschedule} onClick={openReschedule}>Reschedule</button>
          <button className="btn btn-outline" disabled={!props.canCancel} onClick={() => setMode("cancel")}>Cancel booking</button>
          {(!props.canCancel || !props.canReschedule) && <p className="w-full text-sm text-[var(--muted-ink)]">Changes are possible online up to {props.cancelCutoff} hours before your session. Please contact us for anything later.</p>}
        </div>
      )}
      {mode === "cancel" && (
        <div className="space-y-4">
          {props.policy && <p className="text-sm text-[var(--muted-ink)]">{props.policy}</p>}
          <label className="field-label" htmlFor="reason">Reason (optional)</label>
          <textarea id="reason" className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-4">
            <button className="btn btn-outline" onClick={() => setMode("idle")}>Keep booking</button>
            <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
              const r = await cancelByTokenAction(props.token, reason);
              setMsg(r.ok ? { ok: true, text: "Your booking has been cancelled. A confirmation email is on its way." } : { ok: false, text: r.error });
              if (r.ok) { setMode("idle"); router.refresh(); }
            })}>{pending ? "Cancelling…" : "Confirm cancellation"}</button>
          </div>
        </div>
      )}
      {mode === "reschedule" && (
        <div className="space-y-6">
          <div>
            <p className="field-label">New date</p>
            <div className="flex flex-wrap gap-2">
              {days.slice(0, 21).map((d) => (
                <button key={d} className="min-h-11 border border-[var(--line)] px-3 text-sm hover:border-[var(--ink)]" onClick={() => bookingSlotsAction(props.serviceSlug, d).then((r) => r.ok && setSlots(r.data ?? []))}>
                  {new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
                </button>
              ))}
            </div>
          </div>
          {slots.length > 0 && (
            <div>
              <p className="field-label">New time ({tz})</p>
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button key={s.start} disabled={pending} className="min-h-11 border border-[var(--line)] px-4 text-sm font-semibold hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                    onClick={() => start(async () => {
                      const r = await rescheduleByTokenAction(props.token, s.start);
                      setMsg(r.ok ? { ok: true, text: "Rescheduled. We've emailed your updated details." } : { ok: false, text: r.error });
                      if (r.ok) { setMode("idle"); router.refresh(); }
                    })}>
                    {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(s.start))}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-outline" onClick={() => setMode("idle")}>Back</button>
        </div>
      )}
    </div>
  );
}
