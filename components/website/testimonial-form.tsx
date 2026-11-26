"use client";

import { useActionState } from "react";
import { submitTestimonialAction } from "@/features/website/presentation/public-actions";

export function TestimonialForm({ token, name, email }: { token?: string; name?: string; email?: string } = {}) {
  const [state, action, pending] = useActionState(submitTestimonialAction, null);
  if (state?.ok) return <p role="status" className="display-sm border-l-2 border-[var(--brand-accent)] pl-6">Thank you — that means a great deal.</p>;
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2" noValidate>
      <div aria-hidden className="hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      {token && <input type="hidden" name="requestToken" value={token} />}
      {([["authorName", "Your name", "name"], ["email", "Email (not published)", "email"], ["authorTitle", "Role / title", "organization-title"], ["company", "Company", "organization"]] as const).map(([k, l, ac]) => (
        <div key={k}>
          <label htmlFor={`t-${k}`} className="field-label">{l}</label>
          <input id={`t-${k}`} name={k} autoComplete={ac} type={k === "email" ? "email" : "text"} className="field" aria-invalid={Boolean(err(k))}
            defaultValue={k === "authorName" ? name : k === "email" ? email : undefined} readOnly={k === "email" && Boolean(token && email)} />
          {err(k) && <p className="mt-1 text-sm text-red-700">{err(k)}</p>}
        </div>
      ))}
      <div className="sm:col-span-2">
        <label htmlFor="t-quote" className="field-label">Your testimonial</label>
        <textarea id="t-quote" name="quote" rows={6} className="field" aria-invalid={Boolean(err("quote"))} />
        {err("quote") && <p className="mt-1 text-sm text-red-700">{err("quote")}</p>}
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="field-label">Rating (optional)</legend>
        <div className="flex gap-4">{[5, 4, 3, 2, 1].map((n) => <label key={n} className="flex items-center gap-2 text-sm"><input type="radio" name="rating" value={n} /> {n}</label>)}</div>
      </fieldset>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="consentPublish" className="mt-0.5 size-4 accent-[var(--brand-accent)]" />
        <span>I give permission for my name, title, company and testimonial to be published on this website and in marketing materials.</span>
      </label>
      {state && !state.ok && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : "Submit"}</button></div>
    </form>
  );
}
