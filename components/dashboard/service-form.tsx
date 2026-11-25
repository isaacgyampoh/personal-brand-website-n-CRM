import { ActionForm, Check, Field, Select, Submit, TextArea } from "./forms";
import { saveServiceAction } from "@/features/bookings/presentation/admin-actions";
import { minorToMajorString } from "@/lib/money";
import { plainText } from "@/features/content/domain/rich-text";
import type { ServiceRow } from "@/features/bookings/infrastructure/repository";
import { MediaPicker } from "./media-picker";

export function ServiceForm({ s }: { s?: ServiceRow }) {
  return (
    <ActionForm action={saveServiceAction} className="space-y-6">
      {s && <input type="hidden" name="id" value={s.id} />}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Basics</legend>
        <Field label="Name" name="name" defaultValue={s?.name} required />
        <Field label="URL slug" name="slug" defaultValue={s?.slug} hint="Leave blank to generate from the name" />
        <Field label="Category" name="category" defaultValue={s?.category ?? "coaching"} hint="e.g. coaching, consulting, mentorship" />
        <Select label="How people book" name="bookingMode" defaultValue={s?.booking_mode ?? "instant"} options={[["instant", "Instant online booking"], ["enquiry", "Enquiry form only"], ["none", "Display only"]] as const} />
        <TextArea label="Summary" name="summary" defaultValue={s?.summary} rows={2} className="sm:col-span-2" />
        <TextArea label="Description" name="description" defaultValue={s ? plainText(s.description) : ""} rows={6} className="sm:col-span-2" hint="Paragraphs separated by a blank line." />
        <div className="sm:col-span-2"><MediaPicker name="imageMediaId" label="Image" defaultId={s?.image_media_id ?? ""} /></div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Pricing & duration</legend>
        <Field label="Price (0 = free)" name="price" inputMode="decimal" defaultValue={s ? minorToMajorString(s.price_minor, s.currency) : "0"} />
        <Field label="Currency" name="currency" defaultValue={s?.currency ?? "GHS"} maxLength={3} />
        <Field label="Price label (optional)" name="priceDisplay" defaultValue={s?.price_display} hint="e.g. “From GH₵1,500”" />
        <Field label="Duration (min)" name="durationMinutes" type="number" defaultValue={s?.duration_minutes ?? 60} required />
        <Field label="Buffer before (min)" name="bufferBeforeMinutes" type="number" defaultValue={s?.buffer_before_minutes ?? 0} />
        <Field label="Buffer after (min)" name="bufferAfterMinutes" type="number" defaultValue={s?.buffer_after_minutes ?? 15} />
        <Field label="Start times every (min)" name="slotIntervalMinutes" type="number" defaultValue={s?.slot_interval_minutes ?? 30} />
        <Field label="Capacity per slot" name="capacity" type="number" defaultValue={s?.capacity ?? 1} hint=">1 for group sessions" />
        <Field label="Minimum notice (hours)" name="minNoticeHours" type="number" step="0.5" defaultValue={s ? s.min_notice_minutes / 60 : 12} />
        <Field label="Book up to (days ahead)" name="maxAdvanceDays" type="number" defaultValue={s?.max_advance_days ?? 60} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Location</legend>
        <Select label="Format" name="locationType" defaultValue={s?.location_type ?? "online"} options={[["online", "Online"], ["in_person", "In person"], ["phone", "Phone"]] as const} />
        <Select label="Meeting provider" name="meetingProvider" defaultValue={s?.meeting_provider ?? "manual"} options={[["manual", "Manual link"], ["google_meet", "Google Meet"], ["zoom", "Zoom"]] as const} />
        <Field label="Default meeting link" name="defaultMeetingUrl" defaultValue={s?.default_meeting_url ?? ""} placeholder="https://" hint="Only shown to confirmed clients" />
        <Field label="Address / details" name="locationDetails" defaultValue={s?.location_details} className="sm:col-span-3" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Changes & refunds</legend>
        <Field label="Self-cancel up to (hours before)" name="cancelCutoffHours" type="number" defaultValue={s?.cancel_cutoff_hours ?? 24} />
        <Field label="Self-reschedule up to (hours before)" name="rescheduleCutoffHours" type="number" defaultValue={s?.reschedule_cutoff_hours ?? 24} />
        <Field label="Max reschedules" name="maxReschedules" type="number" defaultValue={s?.max_reschedules ?? 2} />
        <TextArea label="Cancellation policy (shown to clients)" name="cancellationPolicy" defaultValue={s?.cancellation_policy} rows={2} className="sm:col-span-3" />
        <Check label="Refund automatically when cancelled within the policy" name="refundOnCancel" defaultChecked={s?.refund_on_cancel ?? true} className="sm:col-span-3" />
      </fieldset>
      <fieldset className="flex flex-wrap items-end gap-6">
        <Check label="Active (visible and bookable)" name="isActive" defaultChecked={s?.is_active ?? true} />
        <Check label="Featured on homepage" name="featured" defaultChecked={s?.featured ?? false} />
        <Field label="Sort order" name="sortOrder" type="number" defaultValue={s?.sort_order ?? 0} className="w-28" />
      </fieldset>
      <Submit>{s ? "Save service" : "Create service"}</Submit>
    </ActionForm>
  );
}
