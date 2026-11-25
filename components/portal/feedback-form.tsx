"use client";

import { useActionState } from "react";
import { eventFeedbackAction } from "@/features/website/presentation/public-actions";

export function FeedbackForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(eventFeedbackAction, null);
  if (state?.ok) return <p role="status">Thank you for your feedback.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <fieldset><legend className="field-label">Rating</legend><div className="flex gap-3">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" value={n} required /> {n}</label>)}</div></fieldset>
      <label className="field-label" htmlFor="fb-c">Comments</label>
      <textarea id="fb-c" name="comments" rows={3} className="field" />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="mayQuote" className="mt-0.5" /> You may quote my comments (with my name) on the website.</label>
      {state && !state.ok && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>Send feedback</button>
    </form>
  );
}
