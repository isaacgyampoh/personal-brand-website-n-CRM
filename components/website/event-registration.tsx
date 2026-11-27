"use client";

import { useState, useTransition } from "react";
import { registerEventAction } from "@/features/website/presentation/public-actions";
import { formatMoney } from "@/lib/money";

type Ticket = { id: string; name: string; description: string; priceMinor: number; currency: string; remaining: number | null; maxPerOrder: number; salesEndAt: string | null };

// Fixed locale + time zone: the server and the visitor's browser must render identical text (no hydration mismatch).
const money = (minor: number, currency: string) => (minor === 0 ? "Free" : formatMoney(minor, currency));

export function EventRegistration({ eventSlug, tickets, paymentsReady, timezone = "Africa/Accra" }: { eventSlug: string; tickets: Ticket[]; paymentsReady: boolean; timezone?: string }) {
  const [ticketId, setTicketId] = useState(tickets.find((t) => t.remaining !== 0)?.id ?? tickets[0]?.id);
  const ticket = tickets.find((t) => t.id === ticketId)!;
  const max = Math.min(ticket.maxPerOrder, ticket.remaining ?? ticket.maxPerOrder);
  const [qty, setQty] = useState(1);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", discountCode: "", consentMarketing: false, acceptPolicy: false });
  const [guests, setGuests] = useState<{ fullName: string; email: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const paid = ticket.priceMinor > 0;
  const blocked = paid && !paymentsReady;

  const setQuantity = (n: number) => {
    const q = Math.max(1, Math.min(max, n));
    setQty(q);
    setGuests((g) => Array.from({ length: q - 1 }, (_, i) => g[i] ?? { fullName: "", email: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await registerEventAction({ eventSlug, ticketTypeId: ticket.id, ...form, attendees: guests, acceptPolicy: form.acceptPolicy as true });
      if (r.ok && r.data) window.location.assign(r.data.redirect);
      else if (!r.ok) { setError(r.error); setFieldErrors(r.fieldErrors ?? {}); }
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
      <fieldset>
        <legend className="field-label">Ticket</legend>
        <div className="space-y-2">
          {tickets.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-start justify-between gap-4 border p-4 ${t.id === ticketId ? "border-[var(--ink)]" : "border-[var(--line)]"} ${t.remaining === 0 ? "opacity-50" : ""}`}>
              <span className="flex gap-3">
                <input type="radio" name="ticket" value={t.id} checked={t.id === ticketId} disabled={t.remaining === 0} onChange={() => { setTicketId(t.id); setQuantity(1); }} className="mt-1 accent-[var(--brand-accent)]" />
                <span>
                  <span className="block font-semibold">{t.name}</span>
                  {t.description && <span className="block text-sm text-[var(--muted-ink)]">{t.description}</span>}
                  {t.remaining !== null && t.remaining <= 10 && <span className="mt-1 block text-xs font-semibold text-[var(--brand-accent)]">{t.remaining === 0 ? "Sold out" : `${t.remaining} left`}</span>}
                  {t.salesEndAt && <span className="mt-1 block text-xs text-[var(--muted-ink)]">Until {new Date(t.salesEndAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: timezone })}</span>}
                </span>
              </span>
              <span className="font-semibold">{money(t.priceMinor, t.currency)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {max > 1 && (
        <div className="flex items-center justify-between">
          <span className="field-label !mb-0" id="qty-label">Places</span>
          <div className="flex items-center border border-[var(--line)]" role="group" aria-labelledby="qty-label">
            <button type="button" className="size-11" onClick={() => setQuantity(qty - 1)} aria-label="Fewer places">−</button>
            <span className="w-10 text-center font-semibold" aria-live="polite">{qty}</span>
            <button type="button" className="size-11" onClick={() => setQuantity(qty + 1)} aria-label="More places">+</button>
          </div>
        </div>
      )}

      {([["fullName", "Full name", "name", "text"], ["email", "Email", "email", "email"], ["phone", "Phone (optional)", "tel", "tel"]] as const).map(([k, label, ac, type]) => (
        <div key={k}>
          <label htmlFor={`ev-${k}`} className="field-label">{label}</label>
          <input id={`ev-${k}`} type={type} autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field" aria-invalid={Boolean(fieldErrors[k])} />
          {fieldErrors[k] && <p className="mt-1 text-sm text-red-700">{fieldErrors[k]}</p>}
        </div>
      ))}

      {guests.map((g, i) => (
        <fieldset key={i} className="border-t border-[var(--line)] pt-4">
          <legend className="field-label">Guest {i + 2}</legend>
          <div className="grid gap-3">
            <input aria-label={`Guest ${i + 2} name`} placeholder="Full name" className="field" value={g.fullName} onChange={(e) => setGuests(guests.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))} />
            <input aria-label={`Guest ${i + 2} email`} placeholder="Email" type="email" className="field" value={g.email} onChange={(e) => setGuests(guests.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
          </div>
        </fieldset>
      ))}

      {paid && (
        <div>
          <label htmlFor="ev-code" className="field-label">Promo code <span className="font-normal opacity-60">(optional)</span></label>
          <input id="ev-code" className="field uppercase" value={form.discountCode} onChange={(e) => setForm({ ...form, discountCode: e.target.value.toUpperCase() })} />
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={form.acceptPolicy} onChange={(e) => setForm({ ...form, acceptPolicy: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>I accept the <a href="/refund-policy" target="_blank" className="underline">refund</a> and <a href="/privacy-policy" target="_blank" className="underline">privacy</a> policies.</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-[var(--muted-ink)]">
        <input type="checkbox" checked={form.consentMarketing} onChange={(e) => setForm({ ...form, consentMarketing: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>Tell me about future masterclasses (optional).</span>
      </label>

      {error && <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {blocked && <p className="text-sm text-[var(--muted-ink)]">Online payment isn&apos;t available yet. Please contact us to register.</p>}

      <div className="flex items-baseline justify-between border-t border-[var(--line)] pt-5">
        <span className="text-sm text-[var(--muted-ink)]">Total</span>
        <span className="font-display text-3xl">{money(ticket.priceMinor * qty, ticket.currency)}</span>
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending || blocked || !form.acceptPolicy}>
        {pending ? "Reserving your place…" : paid ? "Continue to payment" : "Register"}
      </button>
      {paid && <p className="text-center text-xs text-[var(--muted-ink)]">Secure payment by Mobile Money or card via Paystack. Your seat is held while you pay.</p>}
    </form>
  );
}
