import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { appointmentDetail } from "@/features/bookings/application/admin";
import { loadSetting } from "@/features/settings/application/settings";
import { adminCancelAction, adminRescheduleAction, updateAppointmentAction } from "@/features/bookings/presentation/admin-actions";
import { db } from "@/lib/database/pool";
import { formatMoney } from "@/lib/money";
import { formatDateTime, toLocalInput } from "@/lib/time";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Check, Field, Submit, TextArea } from "@/components/dashboard/forms";

export const metadata = { title: "Appointment" };

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("bookings:view");
  const { id } = await params;
  const [a, biz] = await Promise.all([appointmentDetail(id), loadSetting("business")]);
  if (!a) notFound();
  const tz = biz.timezone;
  const canManage = user.permissions.has("bookings:manage");
  const history = await db.query<{ action: string; created_at: Date; actor: string | null; data: Record<string, unknown> }>(
    `select l.action, l.created_at, coalesce(u.full_name, l.actor_label) as actor, l.data from audit_logs l left join users u on u.id = l.actor_id
      where l.entity_type = 'appointment' and l.entity_id = $1 order by l.created_at desc`, [id]);
  const active = a.status === "confirmed";
  return (
    <div className="space-y-6">
      <PageTitle title={`${a.service} — ${a.name}`} description={`${a.reference} · ${formatDateTime(a.starts_at, tz)}`} back={{ href: "/admin/bookings", label: "Bookings" }} actions={<StatusBadge status={a.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Details">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Client</dt><dd><Link href={`/admin/crm/${a.contact_id}`} className="font-medium underline">{a.name}</Link><br />{a.email}{a.phone && <><br />{a.phone}</>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">When</dt><dd>{formatDateTime(a.starts_at, tz)}<br /><span className="text-xs text-muted-foreground">Client time zone: {a.customer_timezone} ({formatDateTime(a.starts_at, a.customer_timezone)})</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment</dt><dd>{a.order_id ? <Link href={`/admin/payments/${a.order_id}`} className="underline">{a.order_reference}</Link> : "Free / not required"} {a.order_status && <StatusBadge status={a.order_status} />}{a.total_minor ? <span className="ml-2">{formatMoney(a.total_minor, a.currency ?? biz.currency)}</span> : null}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Reschedules</dt><dd>{a.reschedule_count}</dd></div>
              {a.customer_notes && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Client notes</dt><dd className="whitespace-pre-wrap">{a.customer_notes}</dd></div>}
              {a.cancel_reason && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Cancellation</dt><dd>By {a.cancelled_by}: {a.cancel_reason}</dd></div>}
            </dl>
          </Panel>
          {canManage && (
            <Panel title="Meeting & notes" description="The meeting link is only shown to the client on their private booking page.">
              <ActionForm action={updateAppointmentAction} className="grid gap-4">
                <input type="hidden" name="id" value={a.id} />
                <Field label="Meeting link" name="meetingUrl" defaultValue={a.meeting_url ?? ""} placeholder="https://meet.google.com/…" />
                <TextArea label="Joining instructions for the client" name="meetingDetails" defaultValue={a.meeting_details} rows={2} />
                <TextArea label="Private notes" name="internalNotes" defaultValue={a.internal_notes} rows={3} />
                <div><Submit>Save</Submit></div>
              </ActionForm>
            </Panel>
          )}
          <Panel title="History">
            <ul className="space-y-2 text-sm">
              <li className="text-muted-foreground">Created {formatDateTime(a.created_at, tz)}</li>
              {history.map((h, i) => <li key={i}><span className="font-medium">{h.action.replace("appointment.", "")}</span> by {h.actor ?? "system"} · <span className="text-muted-foreground">{formatDateTime(h.created_at, tz)}</span></li>)}
            </ul>
          </Panel>
        </div>
        {canManage && active && (
          <div className="space-y-6">
            <Panel title="Outcome">
              <div className="flex gap-2">
                <ActionButton action={updateAppointmentAction} fields={{ id: a.id, status: "completed" }} label="Mark completed" />
                <ActionButton action={updateAppointmentAction} fields={{ id: a.id, status: "no_show" }} label="No-show" variant="secondary" />
              </div>
            </Panel>
            <Panel title="Reschedule">
              <ActionForm action={adminRescheduleAction} success="Rescheduled — client notified" className="space-y-3">
                <input type="hidden" name="id" value={a.id} />
                <Field label={`New start (${tz})`} name="startsAt" type="datetime-local" defaultValue={toLocalInput(a.starts_at, tz)} required />
                <Check label="Override availability rules" name="override" hint="Still protected against double booking." />
                <Submit variant="outline">Reschedule</Submit>
              </ActionForm>
            </Panel>
            <Panel title="Cancel">
              <ActionForm action={adminCancelAction} success="Cancelled — client notified" confirm="Cancel this appointment and notify the client?" className="space-y-3">
                <input type="hidden" name="id" value={a.id} />
                <TextArea label="Reason (sent to client)" name="reason" rows={2} />
                <p className="text-xs text-muted-foreground">If the service refunds on cancellation and the booking was paid online, a full refund is initiated automatically.</p>
                <Submit variant="destructive">Cancel appointment</Submit>
              </ActionForm>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
