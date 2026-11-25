"use client";

import { useActionState, useId } from "react";
import { subscribeAction } from "@/features/website/presentation/public-actions";

export function NewsletterForm({ source, compact = false, buttonLabel = "Subscribe" }: { source: string; compact?: boolean; buttonLabel?: string }) {
  const [state, action, pending] = useActionState(subscribeAction, null);
  const id = useId();
  if (state?.ok) {
    return (
      <p role="status" className="border-l-2 border-[var(--brand-accent)] pl-4 leading-relaxed">
        Almost there — check your inbox and confirm your subscription.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="source" value={source} />
      <div aria-hidden className="hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {!compact && (
        <div>
          <label htmlFor={`${id}-name`} className="field-label">First name <span className="font-normal opacity-60">(optional)</span></label>
          <input id={`${id}-name`} name="fullName" autoComplete="given-name" className="field" />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
        <input id={`${id}-email`} name="email" type="email" required autoComplete="email" placeholder="Your email address" className="field flex-1 !text-[var(--ink)]" aria-invalid={Boolean(state && !state.ok && state.fieldErrors?.email)} />
        <button type="submit" className="btn btn-accent" disabled={pending}>{pending ? "Sending…" : buttonLabel}</button>
      </div>
      <label className="flex items-start gap-3 text-sm leading-snug opacity-85">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>I&apos;d like to receive the newsletter by email. Unsubscribe anytime.</span>
      </label>
      {state && !state.ok && <p role="alert" className="text-sm font-medium text-red-700 [.tone-ink_&]:text-red-300">{state.fieldErrors?.email ?? state.fieldErrors?.consent ?? state.error}</p>}
    </form>
  );
}
