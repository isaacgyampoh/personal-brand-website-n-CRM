"use client";

import { useState, useTransition } from "react";
import { purchaseAction } from "@/features/website/presentation/public-actions";

export function PurchasePanel(props: { type: "course" | "product"; slug: string; priceLabel: string; free: boolean; paymentsReady: boolean; cta?: string }) {
  const [form, setForm] = useState({ fullName: "", email: "", discountCode: "", consentMarketing: false, acceptPolicy: false });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const blocked = !props.free && !props.paymentsReady;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await purchaseAction({ type: props.type, slug: props.slug, ...form, acceptPolicy: form.acceptPolicy as true });
          if (r.ok && r.data) window.location.assign(r.data.redirect);
          else if (!r.ok) { setError(r.error); setFieldErrors(r.fieldErrors ?? {}); }
        });
      }}
    >
      <p className="font-display text-4xl">{props.priceLabel}</p>
      {([["fullName", "Full name", "name", "text"], ["email", "Email", "email", "email"]] as const).map(([k, label, ac, type]) => (
        <div key={k}>
          <label htmlFor={`pp-${k}`} className="field-label">{label}</label>
          <input id={`pp-${k}`} type={type} autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field" aria-invalid={Boolean(fieldErrors[k])} />
          {fieldErrors[k] && <p className="mt-1 text-sm text-red-700">{fieldErrors[k]}</p>}
        </div>
      ))}
      {!props.free && (
        <div>
          <label htmlFor="pp-code" className="field-label">Discount code <span className="font-normal opacity-60">(optional)</span></label>
          <input id="pp-code" className="field uppercase" value={form.discountCode} onChange={(e) => setForm({ ...form, discountCode: e.target.value.toUpperCase() })} />
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={form.acceptPolicy} onChange={(e) => setForm({ ...form, acceptPolicy: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>I accept the <a href="/terms-of-service" target="_blank" className="underline">terms</a> and <a href="/privacy-policy" target="_blank" className="underline">privacy policy</a>.</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-[var(--muted-ink)]">
        <input type="checkbox" checked={form.consentMarketing} onChange={(e) => setForm({ ...form, consentMarketing: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>Email me occasional insights and new resources (optional).</span>
      </label>
      {error && <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {blocked && <p className="text-sm text-[var(--muted-ink)]">Online payment isn&apos;t available yet. Please contact us.</p>}
      <button className="btn btn-primary w-full" disabled={pending || blocked || !form.acceptPolicy}>
        {pending ? "Please wait…" : props.cta ?? (props.free ? "Get access" : "Continue to payment")}
      </button>
      <p className="text-xs text-[var(--muted-ink)]">No account needed. Access is linked to your email — sign in with it anytime to open your library.</p>
    </form>
  );
}
