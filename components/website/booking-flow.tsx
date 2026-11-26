"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { bookingDaysAction, bookingSlotsAction, createBookingAction } from "@/features/website/presentation/public-actions";

type Slot = { start: string; end: string; remaining: number };
type Step = "time" | "details" | "review";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function BookingFlow(props: { serviceSlug: string; serviceName: string; priceLabel: string; paid: boolean; businessTimezone: string }) {
  const [tz, setTz] = useState(props.businessTimezone);
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || props.businessTimezone), [props.businessTimezone]);

  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [days, setDays] = useState<Set<string> | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<Step>("time");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", notes: "", discountCode: "", consentMarketing: false, acceptPolicy: false });
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    const startKey = keyOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
    bookingDaysAction(props.serviceSlug, startKey).then((r) => {
      if (!live) return;
      if (r.ok) setDays(new Set(r.data ?? []));
      else setError(r.error);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.serviceSlug]);

  const selectDay = (d: string) => {
    setDay(d);
    setSlot(null);
    setSlots(null);
    setError(null);
    bookingSlotsAction(props.serviceSlug, d).then((r) => (r.ok ? setSlots(r.data ?? []) : setError(r.error)));
  };

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const count = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[];
  }, [month]);

  const fmtTime = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtFull = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(month.y, month.m - 1, 1)));
  const canPrev = month.y > today.getFullYear() || month.m > today.getMonth() + 1;

  const submit = () => {
    if (!slot) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const r = await createBookingAction({ serviceSlug: props.serviceSlug, startsAt: slot.start, timezone: tz, ...form, acceptPolicy: form.acceptPolicy as true });
      if (r.ok && r.data) window.location.assign(r.data.redirect);
      else if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        if (r.fieldErrors && Object.keys(r.fieldErrors).some((k) => ["fullName", "email", "phone"].includes(k))) setStep("details");
        if (/no longer available|just booked/i.test(r.error)) { setStep("time"); if (day) selectDay(day); }
      }
    });
  };

  const steps: [Step, string][] = [["time", "Date & time"], ["details", "Your details"], ["review", "Confirm"]];

  return (
    <div>
      <ol className="mb-10 grid grid-cols-3 gap-3" aria-label="Booking steps">
        {steps.map(([k, label], i) => (
          <li key={k} aria-current={step === k ? "step" : undefined} className={`border-t-2 pt-3 text-xs font-semibold uppercase tracking-[0.14em] ${step === k ? "border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted-ink)]"}`}>
            <span className="mr-2 font-display text-base normal-case tracking-normal">{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="mb-6 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {step === "time" && (
        <div className="grid gap-10 md:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <button type="button" className="inline-flex size-11 items-center justify-center disabled:opacity-30" disabled={!canPrev} onClick={() => setMonth(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }))} aria-label="Previous month">←</button>
              <p className="font-display text-2xl" aria-live="polite">{monthLabel}</p>
              <button type="button" className="inline-flex size-11 items-center justify-center" onClick={() => setMonth(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }))} aria-label="Next month">→</button>
            </div>
            <div className="grid grid-cols-7 text-center text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted-ink)]" aria-hidden>
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d} className="py-2">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Available dates">
              {grid.map((d, i) => {
                if (!d) return <span key={i} />;
                const k = keyOf(month.y, month.m, d);
                const available = days?.has(k);
                const selected = day === k;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!available}
                    onClick={() => selectDay(k)}
                    aria-pressed={selected}
                    aria-label={`${d} ${monthLabel}${available ? ", available" : ", unavailable"}`}
                    className={`aspect-square min-h-11 text-sm transition-colors ${selected ? "bg-[var(--ink)] text-[var(--paper)]" : available ? "font-semibold hover:bg-[color-mix(in_oklab,var(--brand-accent)_18%,transparent)]" : "text-[var(--muted-ink)] opacity-40"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {days === null && <p className="mt-4 text-sm text-[var(--muted-ink)]">Loading availability…</p>}
            {days?.size === 0 && <p className="mt-4 text-sm text-[var(--muted-ink)]">No times are available in the next six weeks. Please get in touch.</p>}
          </div>
          <div>
            <p className="eyebrow mb-4">{day ? new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "Choose a date"}</p>
            {day && slots === null && <p className="text-sm text-[var(--muted-ink)]">Loading times…</p>}
            {slots?.length === 0 && <p className="text-sm text-[var(--muted-ink)]">No times left on this day.</p>}
            <div className="grid grid-cols-2 gap-2">
              {slots?.map((s) => (
                <button key={s.start} type="button" onClick={() => setSlot(s)} aria-pressed={slot?.start === s.start}
                  className={`min-h-12 border text-sm font-semibold transition-colors ${slot?.start === s.start ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)] hover:border-[var(--ink)]"}`}>
                  {fmtTime(s.start)}
                </button>
              ))}
            </div>
            <label className="mt-6 block text-xs text-[var(--muted-ink)]">
              Time zone
              <select value={tz} onChange={(e) => setTz(e.target.value)} className="field mt-1 !min-h-10 !py-2 text-sm">
                {[...new Set([tz, props.businessTimezone, "Africa/Accra", "Africa/Lagos", "Europe/London", "America/New_York", "UTC"])].map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-primary mt-8 w-full" disabled={!slot} onClick={() => setStep("details")}>Continue</button>
          </div>
        </div>
      )}

      {step === "details" && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setStep("review"); }}>
          {([["fullName", "Full name", "name", "text", true], ["email", "Email", "email", "email", true], ["phone", "Phone (optional)", "tel", "tel", false]] as const).map(([k, label, ac, type, req]) => (
            <div key={k}>
              <label htmlFor={`bk-${k}`} className="field-label">{label}</label>
              <input id={`bk-${k}`} type={type} autoComplete={ac} required={req} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field" aria-invalid={Boolean(fieldErrors[k])} aria-describedby={fieldErrors[k] ? `bk-${k}-err` : undefined} />
              {fieldErrors[k] && <p id={`bk-${k}-err`} className="mt-1 text-sm text-red-700">{fieldErrors[k]}</p>}
            </div>
          ))}
          <div>
            <label htmlFor="bk-notes" className="field-label">What would you like to focus on? <span className="font-normal opacity-60">(optional)</span></label>
            <textarea id="bk-notes" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="field" />
          </div>
          {props.paid && (
            <div>
              <label htmlFor="bk-code" className="field-label">Discount code <span className="font-normal opacity-60">(optional)</span></label>
              <input id="bk-code" value={form.discountCode} onChange={(e) => setForm({ ...form, discountCode: e.target.value.toUpperCase() })} className="field max-w-xs uppercase" />
            </div>
          )}
          <div className="flex gap-4 pt-4">
            <button type="button" className="btn btn-outline" onClick={() => setStep("time")}>Back</button>
            <button type="submit" className="btn btn-primary flex-1">Review booking</button>
          </div>
        </form>
      )}

      {step === "review" && slot && (
        <div>
          <dl className="card-frame divide-y divide-[var(--line)] text-sm">
            {[["Session", props.serviceName], ["When", fmtFull(slot.start)], ["Name", form.fullName], ["Email", form.email], ["Investment", props.priceLabel]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 px-5 py-4"><dt className="text-[var(--muted-ink)]">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
            ))}
          </dl>
          <label className="mt-6 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={form.acceptPolicy} onChange={(e) => setForm({ ...form, acceptPolicy: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
            <span>I agree to the <a href="/cancellation-policy" target="_blank" className="underline">cancellation</a> and <a href="/privacy-policy" target="_blank" className="underline">privacy</a> policies.</span>
          </label>
          {fieldErrors.acceptPolicy && <p className="mt-1 text-sm text-red-700">{fieldErrors.acceptPolicy}</p>}
          <label className="mt-3 flex items-start gap-3 text-sm text-[var(--muted-ink)]">
            <input type="checkbox" checked={form.consentMarketing} onChange={(e) => setForm({ ...form, consentMarketing: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
            <span>Send me occasional insights and event invitations by email (optional).</span>
          </label>
          <div className="mt-8 flex gap-4">
            <button type="button" className="btn btn-outline" onClick={() => setStep("details")} disabled={pending}>Back</button>
            <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={pending || !form.acceptPolicy}>
              {pending ? "Reserving…" : props.paid ? "Continue to secure payment" : "Confirm booking"}
            </button>
          </div>
          {props.paid && <p className="mt-4 text-xs text-[var(--muted-ink)]">Your time is held for a few minutes while you pay securely with Mobile Money or card via Paystack.</p>}
        </div>
      )}
    </div>
  );
}
