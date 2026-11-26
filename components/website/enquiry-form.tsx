"use client";

import Link from "next/link";
import { useActionState } from "react";
import { enquiryAction } from "@/features/website/presentation/public-actions";

type Form = "contact" | "speaking" | "partnership" | "corporate_training" | "media";

export function EnquiryForm({ form, defaultSubject = "", showOrg = false, showEventFields = false, submitLabel = "Send enquiry" }: { form: Form; defaultSubject?: string; showOrg?: boolean; showEventFields?: boolean; submitLabel?: string }) {
  const [state, action, pending] = useActionState(enquiryAction, null);
  if (state?.ok) {
    return (
      <div role="status" className="border-l-2 border-[var(--brand-accent)] py-2 pl-6">
        <p className="display-sm">Thank you — your message has been received.</p>
        <p className="mt-2 text-[var(--muted-ink)]">You&apos;ll hear back personally, usually within two working days.</p>
      </div>
    );
  }
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`f-${name}`} className="field-label">{label}</label>
      <input id={`f-${name}`} name={name} className="field" aria-invalid={Boolean(err(name))} aria-describedby={err(name) ? `f-${name}-e` : undefined} {...props} />
      {err(name) && <p id={`f-${name}-e`} className="mt-1 text-sm text-red-700">{err(name)}</p>}
    </div>
  );
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2" noValidate>
      <input type="hidden" name="form" value={form} />
      <div aria-hidden className="hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      {field("fullName", "Full name", { autoComplete: "name", required: true })}
      {field("email", "Email", { type: "email", autoComplete: "email", required: true })}
      {field("phone", "Phone (optional)", { type: "tel", autoComplete: "tel" })}
      {showOrg ? field("organisation", "Organisation", { autoComplete: "organization" }) : field("subject", "Subject", { defaultValue: defaultSubject })}
      {showEventFields && field("eventDate", "Event date (if known)")}
      {showEventFields && field("budget", "Budget / fee range (optional)")}
      <div className="sm:col-span-2">
        <label htmlFor="f-message" className="field-label">Message</label>
        <textarea id="f-message" name="message" rows={6} required className="field" aria-invalid={Boolean(err("message"))} />
        {err("message") && <p className="mt-1 text-sm text-red-700">{err("message")}</p>}
      </div>
      <label className="flex items-start gap-3 text-sm text-[var(--muted-ink)] sm:col-span-2">
        <input type="checkbox" name="consentMarketing" className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>I&apos;d also like to receive occasional updates by email (optional).</span>
      </label>
      <p className="text-xs text-[var(--muted-ink)] sm:col-span-2">Your details are used only to respond to this enquiry. See the <Link className="underline" href="/privacy-policy">privacy policy</Link>.</p>
      {state && !state.ok && <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : submitLabel}</button></div>
    </form>
  );
}
