"use client";

import { useState } from "react";
import { ActionForm, Check, Field, Select, Submit, TextArea } from "./forms";
import { MediaPicker } from "./media-picker";
import { quickCreateAction } from "@/features/events/presentation/admin-actions";

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-full bg-foreground text-xs text-background">{n}</span>{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** One-screen masterclass creation for a non-technical owner. Everything else stays editable afterwards. */
export function MasterclassWizard({ currency, zoom, google, paymentsReady }: { currency: string; zoom: boolean; google: boolean; paymentsReady: boolean }) {
  const [format, setFormat] = useState<"online" | "in_person" | "hybrid">("online");
  const [pricing, setPricing] = useState<"free" | "paid">("paid");
  const [provider, setProvider] = useState<string>(zoom ? "zoom" : google ? "google_meet" : "manual");
  const [early, setEarly] = useState(false);
  return (
    <ActionForm action={quickCreateAction} success="Masterclass created" className="space-y-4">
      <Step n={1} title="What is it?">
        <Field label="Title" name="title" required maxLength={200} placeholder="e.g. Personal Branding for Professionals" />
        <TextArea label="Short summary (shown on cards and link previews)" name="summary" required rows={2} maxLength={600} />
      </Step>

      <Step n={2} title="Flyer" hint="Upload the flyer or cover image. It is used on the page and when the link is shared.">
        <MediaPicker name="flyerMediaId" label="Flyer image" />
      </Step>

      <Step n={3} title="When?">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and start time" name="startsAt" type="datetime-local" required />
          <Select label="Duration" name="durationMinutes" defaultValue="90" options={[["60", "1 hour"], ["90", "1½ hours"], ["120", "2 hours"], ["180", "3 hours"], ["240", "Half day"], ["480", "Full day"]] as const} />
        </div>
      </Step>

      <Step n={4} title="Where?">
        <fieldset className="flex flex-wrap gap-4 text-sm">
          {([["online", "Online"], ["in_person", "In person"], ["hybrid", "Hybrid"]] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="format" value={v} checked={format === v} onChange={() => setFormat(v)} />{l}</label>
          ))}
        </fieldset>
        {format !== "online" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue name" name="venueName" required />
            <Field label="Venue address" name="venueAddress" />
          </div>
        )}
        {format !== "in_person" && (
          <>
            <Select label="How will people join online?" name="meetingProvider" value={provider} onChange={(e) => setProvider(e.target.value)}
              options={[
                ...(zoom ? [["zoom", "Create a Zoom meeting automatically"] as const] : []),
                ...(google ? [["google_meet", "Create a Google Meet automatically"] as const] : []),
                ["manual", "Paste a meeting link"] as const,
              ]}
              hint={!zoom && !google ? "Connect Zoom or Google in Settings → Integrations to create meetings automatically." : "Only confirmed attendees see the link, in their portal, shortly before the start."} />
            {provider === "manual" && <Field label="Meeting link" name="meetingUrl" type="url" placeholder="https://…" required />}
          </>
        )}
        {format === "in_person" && <input type="hidden" name="meetingProvider" value="none" />}
      </Step>

      <Step n={5} title="Tickets">
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="pricing" value="paid" checked={pricing === "paid"} onChange={() => setPricing("paid")} />Paid</label>
          <label className="flex items-center gap-2"><input type="radio" name="pricing" value="free" checked={pricing === "free"} onChange={() => setPricing("free")} />Free</label>
        </fieldset>
        {pricing === "paid" && !paymentsReady && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Online payment isn&apos;t connected yet, so paid registration will show as unavailable until Paystack is verified in Settings → Integrations.</p>}
        <input type="hidden" name="currency" value={currency} />
        <div className="grid gap-4 sm:grid-cols-3">
          {pricing === "paid" && <Field label={`Price (${currency})`} name="price" inputMode="decimal" required />}
          <Field label="Seats (leave blank for unlimited)" name="seats" type="number" min={1} />
          <Field label="Registration closes" name="registrationClosesAt" type="datetime-local" hint="Optional. Defaults to the start time." />
        </div>
        {pricing === "paid" && (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} className="size-4" /> Offer an early-bird price</label>
            {early && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Early-bird price (${currency})`} name="earlyBirdPrice" inputMode="decimal" required />
                <Field label="Early bird ends" name="earlyBirdEndsAt" type="datetime-local" required />
              </div>
            )}
          </>
        )}
        <Check label="Offer a waitlist when seats run out" name="waitlist" defaultChecked />
      </Step>

      <Step n={6} title="Details (optional)" hint="What attendees will learn, who it's for. You can add speakers, agenda and FAQs later.">
        <TextArea label="Description" name="description" rows={6} />
      </Step>

      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Submit name="intent" value="draft" variant="outline">Save draft &amp; preview</Submit>
        <Submit name="intent" value="publish">Publish now</Submit>
      </div>
    </ActionForm>
  );
}
