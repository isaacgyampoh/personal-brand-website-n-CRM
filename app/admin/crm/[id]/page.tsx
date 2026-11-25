import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { contactProfile, pipelineStages } from "@/features/crm/application/admin";
import { leadScore } from "@/features/crm/domain/segments";
import { loadSetting } from "@/features/settings/application/settings";
import { deleteContactAction, mergeAction, noteAction, tagsAction, taskAction, taskStatusAction, updateContactAction } from "@/features/crm/presentation/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatInZone } from "@/lib/time";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";
import { ContactForm } from "@/components/dashboard/contact-form";

export const metadata = { title: "Contact" };

const KIND_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", email: "Email", form: "Form", booking: "Booking", payment: "Payment", registration: "Registration", enrolment: "Enrolment", purchase: "Purchase", stage_change: "Stage", consent: "Consent", system: "System", refund: "Refund", assessment: "Assessment" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("crm:view");
  const { id } = await params;
  const [data, stages, biz] = await Promise.all([contactProfile(id), pipelineStages(), loadSetting("business")]);
  if (!data) notFound();
  const { contact: c } = data;
  const tz = biz.timezone;
  const canEdit = user.permissions.has("crm:edit");
  const score = leadScore({ total_spent_minor: c.total_spent_minor, consent_marketing: c.consent_marketing, activity_count: data.activities.length, last_activity_at: c.last_activity_at, has_booking: data.appointments.length > 0 });

  return (
    <div>
      <PageTitle
        title={c.full_name || c.email || c.phone || "Contact"}
        description={[c.email, c.phone, c.company].filter(Boolean).join(" · ")}
        back={{ href: "/admin/crm", label: "Contacts" }}
        actions={<>
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm hover:bg-muted">Email</a>}
          {c.phone && <a href={`tel:${c.phone}`} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm hover:bg-muted">Call</a>}
          {canEdit && <Link href={`/admin/bookings/new?email=${encodeURIComponent(c.email ?? "")}&name=${encodeURIComponent(c.full_name)}`} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm hover:bg-muted">Book appointment</Link>}
        </>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Lifetime value", formatMoney(c.total_spent_minor, biz.currency)],
          ["Lead score", `${score}/100`],
          ["Stage", c.stage_name ?? "—"],
          ["Marketing", c.consent_marketing ? `Consented${c.consent_at ? ` ${formatInZone(c.consent_at, tz, { day: "numeric", month: "short", year: "numeric" })}` : ""}` : "No consent"],
          ["Newsletter", data.subscriber?.status ?? "Not subscribed"],
        ].map(([k, v]) => <div key={k} className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 truncate text-sm font-semibold capitalize">{v}</p></div>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {canEdit && (
            <Panel title="Log activity">
              <ActionForm action={noteAction} success="Added to timeline" resetOnSuccess className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="contactId" value={c.id} />
                <Select label="Type" name="kind" options={[["note", "Note"], ["call", "Call"], ["meeting", "Meeting"], ["email", "Email"]] as const} />
                <Field label="Title" name="title" className="sm:col-span-3" placeholder="e.g. Discovery call" />
                <TextArea label="Details" name="body" rows={3} className="sm:col-span-4" required />
                <div><Submit>Add</Submit></div>
              </ActionForm>
            </Panel>
          )}

          <Panel title="Timeline" description="Everything that has happened with this contact">
            {data.activities.length ? (
              <ol className="relative space-y-5 border-l pl-5">
                {data.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-foreground/60" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[a.kind] ?? a.kind}</span>
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="text-xs text-muted-foreground">{formatInZone(a.occurred_at, tz, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}{a.actor ? ` · ${a.actor}` : ""}</span>
                    </div>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{a.body}</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted-foreground">No activity yet.</p>}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={`Appointments (${data.appointments.length})`}>
              {data.appointments.length ? <ul className="divide-y text-sm">{data.appointments.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2"><Link className="hover:underline" href={`/admin/bookings/${a.id}`}>{a.service}<span className="block text-xs text-muted-foreground">{formatDateTime(a.starts_at, tz)}</span></Link><StatusBadge status={a.status} /></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">None</p>}
            </Panel>
            <Panel title={`Orders (${data.orders.length})`}>
              {data.orders.length ? <ul className="divide-y text-sm">{data.orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 py-2"><Link className="min-w-0 hover:underline" href={`/admin/payments/${o.id}`}><span className="block truncate">{o.items}</span><span className="text-xs text-muted-foreground">{o.reference} · {formatMoney(o.total_minor, o.currency)}</span></Link><StatusBadge status={o.status} /></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">None</p>}
            </Panel>
            <Panel title={`Events (${data.registrations.length})`}>
              {data.registrations.length ? <ul className="divide-y text-sm">{data.registrations.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-2"><span>{r.title}<span className="block text-xs text-muted-foreground">{formatInZone(r.starts_at, tz, { day: "numeric", month: "short", year: "numeric" })}{r.attended_at ? " · attended" : ""}</span></span><StatusBadge status={r.status} /></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">None</p>}
            </Panel>
            <Panel title={`Courses (${data.enrolments.length})`}>
              {data.enrolments.length ? <ul className="divide-y text-sm">{data.enrolments.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2"><span>{e.title}<span className="block text-xs text-muted-foreground">{e.progress}% complete</span></span><StatusBadge status={e.status} /></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">None</p>}
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          {canEdit && <Panel title="Details"><ContactForm action={updateContactAction} stages={stages} contact={c} tz={tz} /></Panel>}
          {canEdit && (
            <Panel title="Tags">
              <ActionForm action={tagsAction} success="Tags saved" className="space-y-2">
                <input type="hidden" name="contactId" value={c.id} />
                <Field label="Comma-separated" name="tags" defaultValue={(c.tags as { name: string }[]).map((t) => t.name).join(", ")} placeholder="vip, speaker-lead" />
                <Submit variant="outline">Save tags</Submit>
              </ActionForm>
            </Panel>
          )}
          <Panel title="Tasks">
            <ul className="mb-3 space-y-2 text-sm">
              {data.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className={t.status !== "open" ? "text-muted-foreground line-through" : ""}>{t.title}{t.due_at && <span className="block text-xs text-muted-foreground">Due {formatInZone(t.due_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}</span>
                  {canEdit && t.status === "open" && <ActionButton action={taskStatusAction} fields={{ id: t.id, status: "done" }} label="Done" />}
                </li>
              ))}
              {!data.tasks.length && <li className="text-muted-foreground">No tasks.</li>}
            </ul>
            {canEdit && (
              <ActionForm action={taskAction} success="Task added" resetOnSuccess className="space-y-2">
                <input type="hidden" name="contactId" value={c.id} />
                <Field label="New task" name="title" placeholder="Send proposal" required />
                <Field label="Due" name="dueAt" type="datetime-local" />
                <Submit variant="outline">Add task</Submit>
              </ActionForm>
            )}
          </Panel>
          {Object.keys(c.attribution ?? {}).length > 0 && (
            <Panel title="Attribution"><dl className="space-y-1 text-xs">{Object.entries(c.attribution).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="truncate">{String(v)}</dd></div>)}</dl></Panel>
          )}
          {canEdit && data.duplicates.length > 0 && (
            <Panel title="Possible duplicates">
              <ul className="space-y-3 text-sm">
                {data.duplicates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/crm/${d.id}`} className="min-w-0 hover:underline"><span className="block truncate">{d.full_name || d.email}</span><span className="text-xs text-muted-foreground">{d.reason}</span></Link>
                    <ActionForm action={mergeAction} success="Merged" confirm="Merge this duplicate into the current contact? Its history will move here.">
                      <input type="hidden" name="targetId" value={c.id} /><input type="hidden" name="sourceId" value={d.id} />
                      <Submit variant="outline" className="h-8 text-xs">Merge here</Submit>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {canEdit && (
            <Panel title="Delete contact">
              <p className="mb-3 text-xs text-muted-foreground">Anonymises personal data. Payment records are retained for legal and accounting purposes.</p>
              <ActionButton action={deleteContactAction} fields={{ id: c.id }} label="Delete & anonymise" variant="destructive" confirm="This permanently removes the person's details. Continue?" />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
