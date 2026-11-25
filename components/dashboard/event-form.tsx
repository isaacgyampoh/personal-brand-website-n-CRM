import { ActionForm, Check, Field, Select, Submit, TextArea } from "./forms";
import { MediaPicker } from "./media-picker";
import { saveEventAction } from "@/features/events/presentation/admin-actions";
import { plainText } from "@/features/content/domain/rich-text";
import { toLocalInput } from "@/lib/time";
import type { EventRow } from "@/features/events/infrastructure/repository";

const join = (rows: Record<string, unknown>[], keys: string[]) => rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(" | ").replace(/( \| )+$/, "")).join("\n");

export function EventForm({ e, defaultTz }: { e?: EventRow & { cover_media_id: string | null; flyer_media_id: string | null }; defaultTz: string }) {
  const tz = e?.timezone ?? defaultTz;
  return (
    <ActionForm action={saveEventAction} className="space-y-8">
      {e && <input type="hidden" name="id" value={e.id} />}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Event</legend>
        <Field label="Title" name="title" defaultValue={e?.title} required className="sm:col-span-2" />
        <Field label="Subtitle" name="subtitle" defaultValue={e?.subtitle} className="sm:col-span-2" />
        <Select label="Type" name="kind" defaultValue={e?.kind ?? "masterclass"} options={[["masterclass", "Masterclass"], ["webinar", "Webinar"], ["workshop", "Workshop"], ["group_coaching", "Group coaching"], ["programme", "Multi-session programme"], ["conference", "Conference / talk"], ["other", "Other"]] as const} />
        <Select label="Format" name="format" defaultValue={e?.format ?? "online"} options={[["online", "Online"], ["in_person", "In person"], ["hybrid", "Hybrid"]] as const} />
        <Field label="URL slug" name="slug" defaultValue={e?.slug} hint="Leave blank to generate from title" />
        <Field label="Time zone" name="timezone" defaultValue={tz} />
        <TextArea label="Short summary (cards & social previews)" name="summary" defaultValue={e?.summary} rows={2} className="sm:col-span-2" />
        <TextArea label="Full description" name="description" defaultValue={e ? plainText(e.description) : ""} rows={8} className="sm:col-span-2" hint="Paragraphs separated by a blank line." />
        <MediaPicker name="coverMediaId" label="Cover image" defaultId={e?.cover_media_id ?? ""} />
        <MediaPicker name="flyerMediaId" label="Flyer (optional)" defaultId={e?.flyer_media_id ?? ""} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">When & where</legend>
        <Field label={`Starts (${tz})`} name="startsAt" type="datetime-local" defaultValue={toLocalInput(e?.starts_at, tz)} required />
        <Field label={`Ends (${tz})`} name="endsAt" type="datetime-local" defaultValue={toLocalInput(e?.ends_at, tz)} required />
        <Field label="Venue name (in person / hybrid)" name="venueName" defaultValue={e?.venue_name} />
        <Field label="Venue address" name="venueAddress" defaultValue={e?.venue_address} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Registration</legend>
        <Field label="Total capacity (blank = unlimited)" name="capacity" type="number" min={1} defaultValue={e?.capacity ?? ""} />
        <Field label="Registration opens" name="registrationOpensAt" type="datetime-local" defaultValue={toLocalInput(e?.registration_opens_at, tz)} hint="Blank = when published" />
        <Field label="Registration closes" name="registrationClosesAt" type="datetime-local" defaultValue={toLocalInput(e?.registration_closes_at, tz)} hint="Blank = at start time" />
        <Check label="Waiting list when full" name="waitlistEnabled" defaultChecked={e?.waitlist_enabled ?? true} />
        <Check label="Certificates for attendees" name="certificateEnabled" defaultChecked={e?.certificate_enabled ?? false} />
        <Check label="Ask for feedback afterwards" name="feedbackEnabled" defaultChecked={(e as { feedback_enabled?: boolean } | undefined)?.feedback_enabled ?? true} />
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Landing page content</legend>
        <TextArea label="Speakers — one per line: Name | Title | Short bio | Photo URL" name="speakers" defaultValue={e ? join(e.speakers, ["name", "title", "bio", "photoUrl"]) : ""} rows={3} />
        <TextArea label="Agenda — one per line: Time | Title | Description" name="agenda" defaultValue={e ? join(e.agenda, ["time", "title", "description"]) : ""} rows={4} />
        <TextArea label="FAQs — one per line: Question | Answer" name="faqs" defaultValue={e ? join(e.faqs.map((f) => ({ q: f.q, a: f.a })), ["q", "a"]) : ""} rows={4} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">SEO & sharing</legend>
        <Field label="SEO title" name="seoTitle" defaultValue={e?.seo?.title} />
        <Field label="SEO description" name="seoDescription" defaultValue={e?.seo?.description} />
        <p className="text-xs text-muted-foreground sm:col-span-2">A branded social preview image is generated automatically for shared links.</p>
      </fieldset>
      <Submit>{e ? "Save changes" : "Create draft"}</Submit>
    </ActionForm>
  );
}
