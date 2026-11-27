"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyAppointmentAction, rescheduleMyAppointmentAction } from "@/features/portal/presentation/actions";
import { bookingDaysAction, bookingSlotsAction } from "@/features/website/presentation/public-actions";

export function PortalAppointment({ id, serviceSlug, canCancel, canReschedule, timezone = "Africa/Accra" }: { id: string; serviceSlug: string; canCancel: boolean; canReschedule: boolean; timezone?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">("idle");
  const [cancelState, cancelAction, cancelling] = useActionState(cancelMyAppointmentAction, null);
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (cancelState?.ok) return <p role="status" className="mt-4 text-sm">Cancelled. A confirmation email is on its way.</p>;
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      {msg && <p role="status" className="mb-3 text-sm">{msg}</p>}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-4 text-sm">
          <button className="btn btn-link !p-0" disabled={!canReschedule} onClick={() => { setMode("reschedule"); bookingDaysAction(serviceSlug, new Date().toISOString().slice(0, 10)).then((r) => r.ok && setDays(r.data ?? [])); }}>Reschedule</button>
          <button className="btn btn-link !p-0" disabled={!canCancel} onClick={() => setMode("cancel")}>Cancel</button>
          {(!canCancel || !canReschedule) && <span className="text-[var(--muted-ink)]">Online changes are closed for this session — please contact us.</span>}
        </div>
      )}
      {mode === "cancel" && (
        <form action={cancelAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="field-label" htmlFor={`r-${id}`}>Reason (optional)</label>
          <textarea id={`r-${id}`} name="reason" rows={2} className="field" />
          {cancelState && !cancelState.ok && <p role="alert" className="text-sm text-red-700">{cancelState.error}</p>}
          <div className="flex gap-3"><button type="button" className="btn btn-outline" onClick={() => setMode("idle")}>Keep it</button><button className="btn btn-primary" disabled={cancelling}>{cancelling ? "Cancelling…" : "Confirm cancellation"}</button></div>
        </form>
      )}
      {mode === "reschedule" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{days.slice(0, 21).map((d) => <button key={d} className="min-h-11 border border-[var(--line)] px-3 text-sm hover:border-[var(--ink)]" onClick={() => bookingSlotsAction(serviceSlug, d).then((r) => r.ok && setSlots(r.data ?? []))}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</button>)}</div>
          <div className="flex flex-wrap gap-2">{slots.map((s) => <button key={s.start} disabled={pending} className="min-h-11 border border-[var(--line)] px-4 text-sm font-semibold hover:bg-[var(--ink)] hover:text-[var(--paper)]" onClick={() => start(async () => {
            const r = await rescheduleMyAppointmentAction(id, s.start);
            if (r.ok) { setMsg("Rescheduled — we've emailed your new time."); setMode("idle"); router.refresh(); } else setMsg(r.error);
          })}>{new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</button>)}</div>
          <button className="btn btn-outline" onClick={() => setMode("idle")}>Back</button>
        </div>
      )}
    </div>
  );
}
