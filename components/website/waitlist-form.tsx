"use client";

import { useActionState } from "react";
import { waitlistAction } from "@/features/website/presentation/public-actions";

export function WaitlistForm({ eventSlug }: { eventSlug: string }) {
  const [state, action, pending] = useActionState(waitlistAction, null);
  if (state?.ok) return <p role="status" className="border-l-2 border-[var(--brand-accent)] pl-4">You&apos;re on the waiting list. We&apos;ll email you if a place opens.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <div aria-hidden className="hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <label className="field-label" htmlFor="wl-name">Full name</label>
      <input id="wl-name" name="fullName" required autoComplete="name" className="field" />
      <label className="field-label" htmlFor="wl-email">Email</label>
      <input id="wl-email" name="email" type="email" required autoComplete="email" className="field" />
      <label className="flex items-start gap-3 text-sm text-[var(--muted-ink)]"><input type="checkbox" name="consentMarketing" className="mt-0.5 size-4" /> Also tell me about future sessions</label>
      {state && !state.ok && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Joining…" : "Join the waiting list"}</button>
    </form>
  );
}
