import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { eventRepo, type EventRow } from "@/features/events/infrastructure/repository";
import { attendees } from "@/features/events/application/admin";
import { loadSetting } from "@/features/settings/application/settings";
import {
  addResourceAction, addSessionsAction, cancelEventAction, certificatesAction, checkInAction, deleteResourceAction, deleteSessionAction,
  deleteTicketAction, duplicateEventAction, eventStatusAction, manualRegistrationAction, rescheduleEventAction, saveAccessAction, saveTicketAction,
} from "@/features/events/presentation/admin-actions";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { formatDateTime, toLocalInput } from "@/lib/time";
import { PageTitle, Panel, StatusBadge, LinkButton, Table, Td, Notice } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";
import { EventForm } from "@/components/dashboard/event-form";
import { MediaPicker } from "@/components/dashboard/media-picker";

export const metadata = { title: "Event" };
const TABS = [["details", "Details"], ["tickets", "Tickets"], ["access", "Joining"], ["schedule", "Sessions"], ["resources", "Resources"], ["attendees", "Attendees"], ["manage", "Manage"]] as const;

export default async function EventAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaffPage("events:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "details";
  const e = await db.one<EventRow & { cover_media_id: string | null; flyer_media_id: string | null; feedback_enabled: boolean }>("select * from events where id = $1", [id]);
  if (!e) notFound();
  const biz = await loadSetting("business");
  const tz = e.timezone;
  const canManage = user.permissions.has("events:manage");
  const [tickets, counts, access, sessions, resources, people, feedback, waitlist] = await Promise.all([
    eventRepo.tickets(id), eventRepo.seatCounts(id),
    db.one<{ meeting_provider: string; meeting_url: string | null; meeting_id: string | null; passcode: string | null; instructions: string; access_opens_minutes_before: number }>("select * from event_access where event_id = $1", [id]),
    db.query<{ id: string; title: string; starts_at: Date; ends_at: Date }>("select * from event_sessions where event_id = $1 order by starts_at", [id]),
    db.query<{ id: string; kind: string; title: string; url: string | null; media_id: string | null; available_from: Date | null }>("select * from event_resources where event_id = $1 order by position, created_at", [id]),
    tab === "attendees" ? attendees(id) : Promise.resolve([]),
    db.one<{ n: number; avg: number | null }>("select count(*)::int as n, round(avg(rating), 1) as avg from event_feedback f join event_registrations r on r.id = f.registration_id where r.event_id = $1", [id]),
    db.one<{ n: number }>("select count(*)::int as n from event_waitlist where event_id = $1 and status = 'waiting'", [id]),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title={e.title}
        description={`${formatDateTime(e.starts_at, tz)} · ${counts.total}${e.capacity ? ` / ${e.capacity}` : ""} seats held or sold${waitlist?.n ? ` · ${waitlist.n} on waiting list` : ""}${feedback?.n ? ` · feedback ${feedback.avg}/5 (${feedback.n})` : ""}`}
        back={{ href: "/admin/events", label: "Masterclasses" }}
        actions={<>
          <StatusBadge status={e.status} />
          {e.status !== "draft" && <LinkButton href={`/masterclasses/${e.slug}`} variant="outline" target="_blank">View page ↗</LinkButton>}
          {canManage && e.status === "draft" && <ActionButton action={eventStatusAction} fields={{ id, op: "publish" }} label="Publish" variant="default" success="Published" />}
          {canManage && e.status === "published" && <ActionButton action={eventStatusAction} fields={{ id, op: "unpublish" }} label="Unpublish" success="Unpublished" />}
        </>}
      />
      {e.status === "draft" && <Notice tone="blue">Draft — not visible on the website. Add at least one ticket, then publish.</Notice>}
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Event sections">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin/events/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</Link>
        ))}
      </nav>

      {tab === "details" && (canManage ? <Panel><EventForm e={e} defaultTz={biz.timezone} /></Panel> : <Notice>View only.</Notice>)}

      {tab === "tickets" && (
        <div className="space-y-6">
          <Table head={["Ticket", "Price", "Sold / limit", "On sale", "Visibility", ""]}>
            {tickets.map((t) => (
              <tr key={t.id}>
                <Td><span className="font-medium">{t.name}</span><div className="text-xs text-muted-foreground">{t.description}</div></Td>
                <Td>{t.price_minor ? formatMoney(t.price_minor, t.currency) : "Free"}</Td>
                <Td>{counts.byTicket.get(t.id) ?? 0}{t.capacity ? ` / ${t.capacity}` : ""}</Td>
                <Td className="text-xs">{t.sales_start_at ? `from ${formatDateTime(t.sales_start_at, tz)}` : "now"}{t.sales_end_at ? <><br />until {formatDateTime(t.sales_end_at, tz)}</> : null}</Td>
                <Td><StatusBadge status={t.visibility} tone={t.visibility === "public" ? "green" : "gray"} /></Td>
                <Td>{canManage && <details><summary className="cursor-pointer text-xs underline">Edit</summary><div className="mt-3 w-[min(80vw,520px)]"><TicketForm eventId={id} tz={tz} t={t} /><div className="mt-2"><ActionButton action={deleteTicketAction} fields={{ id: t.id }} label="Delete" variant="destructive" confirm="Delete this ticket type?" /></div></div></details>}</Td>
              </tr>
            ))}
          </Table>
          {canManage && <Panel title="Add ticket type" description="For early-bird pricing, add a ticket with an end date and a second ticket at the full price."><TicketForm eventId={id} tz={tz} /></Panel>}
        </div>
      )}

      {tab === "access" && (
        <Panel title="Private joining details" description="Shown only on registered attendees' portal page, from the time below. Never on the public page, emails or calendar files.">
          {canManage ? (
            <ActionForm action={saveAccessAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="eventId" value={id} />
              <Select label="Provider" name="provider" defaultValue={access?.meeting_provider ?? "manual"} options={[["manual", "Manual link"], ["zoom", "Zoom"], ["google_meet", "Google Meet"]] as const} />
              <Field label="Join page opens (minutes before start)" name="opensMinutesBefore" type="number" defaultValue={access?.access_opens_minutes_before ?? 30} />
              <Field label="Meeting link" name="url" defaultValue={access?.meeting_url ?? ""} placeholder="https://" className="sm:col-span-2" />
              <Field label="Meeting ID" name="meetingId" defaultValue={access?.meeting_id ?? ""} />
              <Field label="Passcode" name="passcode" defaultValue={access?.passcode ?? ""} />
              <TextArea label="Instructions for attendees" name="instructions" defaultValue={access?.instructions ?? ""} rows={3} className="sm:col-span-2" />
              <p className="text-xs text-muted-foreground sm:col-span-2">Tip: use your provider&apos;s registration / waiting-room features for extra control — a meeting link can always be forwarded by an attendee.</p>
              <div><Submit>Save joining details</Submit></div>
            </ActionForm>
          ) : <p className="text-sm text-muted-foreground">Restricted.</p>}
        </Panel>
      )}

      {tab === "schedule" && (
        <div className="space-y-6">
          <Panel title="Sessions" description="For multi-session programmes. Single events don't need sessions.">
            {sessions.length ? <ul className="divide-y text-sm">{sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2"><span><span className="font-medium">{s.title}</span> · {formatDateTime(s.starts_at, tz)}</span>{canManage && <ActionButton action={deleteSessionAction} fields={{ id: s.id }} label="Remove" />}</li>
            ))}</ul> : <p className="text-sm text-muted-foreground">No sessions.</p>}
          </Panel>
          {canManage && (
            <Panel title="Add session(s)">
              <ActionForm action={addSessionsAction} resetOnSuccess className="grid gap-4 sm:grid-cols-4">
                <input type="hidden" name="eventId" value={id} />
                <Field label="Title" name="title" placeholder="Week" />
                <Field label={`First session start (${biz.timezone})`} name="startsAt" type="datetime-local" required />
                <Field label="Duration (min)" name="durationMinutes" type="number" defaultValue={90} />
                <Field label="Repeat weekly × times" name="repeatWeeks" type="number" min={1} max={52} defaultValue={1} />
                <div><Submit>Add</Submit></div>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}

      {tab === "resources" && (
        <div className="space-y-6">
          <Panel title="Recordings, slides & downloads" description="Available to confirmed attendees in their portal.">
            {resources.length ? <ul className="divide-y text-sm">{resources.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2"><span><StatusBadge status={r.kind} tone="blue" /> <span className="ml-1 font-medium">{r.title}</span>{r.available_from && <span className="text-xs text-muted-foreground"> · from {formatDateTime(r.available_from, tz)}</span>}</span>{canManage && <ActionButton action={deleteResourceAction} fields={{ id: r.id }} label="Remove" />}</li>
            ))}</ul> : <p className="text-sm text-muted-foreground">None yet.</p>}
          </Panel>
          {canManage && (
            <Panel title="Add resource">
              <ActionForm action={addResourceAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="eventId" value={id} />
                <Select label="Type" name="kind" options={[["recording", "Recording"], ["slides", "Slides"], ["download", "Download"], ["link", "Link"]] as const} />
                <Field label="Title" name="title" required />
                <MediaPicker name="mediaId" label="Private file (stored securely)" kind="file" visibility="private" />
                <Field label="…or link (e.g. unlisted video)" name="url" placeholder="https://" />
                <Field label="Available from (optional)" name="availableFrom" type="datetime-local" />
                <div className="sm:col-span-2"><Submit>Add resource</Submit></div>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}

      {tab === "attendees" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/api/admin/export/attendees/${id}`} variant="outline">Export CSV</LinkButton>
            {canManage && e.certificate_enabled && <ActionButton action={certificatesAction} fields={{ id }} label="Issue certificates to attendees" success="Certificates issued" />}
          </div>
          <Table head={["Attendee", "Ticket", "Order", "Status", "Attendance"]}>
            {people.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/admin/crm/${p.contact_id}`} className="font-medium hover:underline">{p.attendee_name || p.attendee_email}</Link><div className="text-xs text-muted-foreground">{p.attendee_email} · {p.reference}</div></Td>
                <Td>{p.ticket}<div className="text-xs capitalize text-muted-foreground">{p.source}</div></Td>
                <Td className="text-xs">{p.order_reference ?? "—"} {p.order_status && <StatusBadge status={p.order_status} />}</Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td>{p.status === "confirmed" && canManage ? (
                  <ActionButton action={checkInAction} fields={{ id: p.id, attended: p.attended_at ? "0" : "1" }} label={p.attended_at ? "✓ Attended" : "Check in"} variant={p.attended_at ? "secondary" : "outline"} success="Updated" />
                ) : p.attended_at ? "Attended" : "—"}</Td>
              </tr>
            ))}
          </Table>
          {!people.length && <p className="text-sm text-muted-foreground">No registrations yet.</p>}
          {canManage && (
            <Panel title="Add a registration" description="For bank-transfer payers, guests and complimentary places. Counts against capacity.">
              <ActionForm action={manualRegistrationAction} resetOnSuccess success="Registered — confirmation sent" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="eventId" value={id} />
                <Field label="Full name" name="fullName" required />
                <Field label="Email" name="email" type="email" required />
                <Select label="Ticket" name="ticketTypeId" options={tickets.map((t) => ({ value: t.id, label: t.name }))} />
                <Select label="Type" name="source" options={[["complimentary", "Complimentary"], ["manual", "Manual (paid offline — record payment separately)"]] as const} />
                <Field label="Note" name="note" className="sm:col-span-2" />
                <div><Submit>Register</Submit></div>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}

      {tab === "manage" && canManage && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Duplicate"><p className="mb-3 text-sm text-muted-foreground">Copies details, tickets, sessions and instructions into a new draft (dates move forward).</p><ActionButton action={duplicateEventAction} fields={{ id }} label="Duplicate event" success="Duplicated" /></Panel>
          <Panel title="Reschedule">
            <ActionForm action={rescheduleEventAction} success="Rescheduled — attendees notified" className="space-y-3">
              <input type="hidden" name="id" value={id} /><input type="hidden" name="timezone" value={tz} />
              <Field label={`New start (${tz})`} name="startsAt" type="datetime-local" defaultValue={toLocalInput(e.starts_at, tz)} required />
              <Field label={`New end (${tz})`} name="endsAt" type="datetime-local" defaultValue={toLocalInput(e.ends_at, tz)} required />
              <Submit variant="outline">Reschedule & notify</Submit>
            </ActionForm>
          </Panel>
          <Panel title="Cancel event">
            {e.status === "cancelled" ? <p className="text-sm">Cancelled.</p> : (
              <ActionForm action={cancelEventAction} success="Cancelled — refunds initiated, attendees notified" confirm="Cancel this event, refund all paid orders in full and email every attendee?" className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <TextArea label="Message to attendees" name="reason" rows={3} />
                <Submit variant="destructive">Cancel & refund everyone</Submit>
              </ActionForm>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function TicketForm({ eventId, tz, t }: { eventId: string; tz: string; t?: { id: string; name: string; description: string; price_minor: number; currency: string; capacity: number | null; sales_start_at: Date | null; sales_end_at: Date | null; max_per_order: number; visibility: string; position: number } }) {
  return (
    <ActionForm action={saveTicketAction} resetOnSuccess={!t} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="timezone" value={tz} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Name" name="name" defaultValue={t?.name} required placeholder="Early bird" />
      <Field label="Price (0 = free)" name="price" defaultValue={t ? minorToMajorString(t.price_minor, t.currency) : "0"} inputMode="decimal" />
      <Field label="Currency" name="currency" defaultValue={t?.currency ?? "GHS"} maxLength={3} />
      <Field label="Limit (blank = event capacity)" name="capacity" type="number" defaultValue={t?.capacity ?? ""} />
      <Field label="Sales start" name="salesStartAt" type="datetime-local" defaultValue={toLocalInput(t?.sales_start_at, tz)} />
      <Field label="Sales end" name="salesEndAt" type="datetime-local" defaultValue={toLocalInput(t?.sales_end_at, tz)} />
      <Field label="Max per order" name="maxPerOrder" type="number" defaultValue={t?.max_per_order ?? 10} />
      <Select label="Visibility" name="visibility" defaultValue={t?.visibility ?? "public"} options={[["public", "Public"], ["hidden", "Hidden"], ["complimentary", "Complimentary (admin only)"]] as const} />
      <Field label="Order" name="position" type="number" defaultValue={t?.position ?? 0} />
      <Field label="Description" name="description" defaultValue={t?.description} className="sm:col-span-3" />
      <div><Submit>{t ? "Save ticket" : "Add ticket"}</Submit></div>
    </ActionForm>
  );
}
