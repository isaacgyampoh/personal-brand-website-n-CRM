import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { upcomingExceptions, weeklyRuleRows } from "@/features/bookings/application/admin";
import { addExceptionAction, deleteExceptionAction } from "@/features/bookings/presentation/admin-actions";
import { formatDateTime } from "@/lib/time";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";
import { HoursEditor } from "@/components/dashboard/hours-editor";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  await requireStaffPage("bookings:manage");
  const [rules, exceptions, services, biz] = await Promise.all([weeklyRuleRows(null), upcomingExceptions(), db.query<{ id: string; name: string }>("select id, name from services where is_active order by name"), loadSetting("business")]);
  return (
    <div className="space-y-6">
      <PageTitle title="Availability" description={`Business time zone: ${biz.timezone}. Published masterclasses automatically block your calendar.`} back={{ href: "/admin/bookings", label: "Bookings" }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Working hours" description="Applies to every service unless the service has its own hours."><HoursEditor serviceId={null} rules={rules} /></Panel>
        <div className="space-y-6">
          <Panel title="Block time / holidays / extra hours">
            <ActionForm action={addExceptionAction} success="Added" resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <Select label="Type" name="kind" options={[["blocked", "Blocked time"], ["holiday", "Holiday / day off"], ["extra_hours", "Extra availability"]] as const} />
              <Select label="Applies to" name="serviceId" options={[{ value: "", label: "All services" }, ...services.map((s) => ({ value: s.id, label: s.name }))]} />
              <Field label="From" name="startsAt" type="datetime-local" required />
              <Field label="Until" name="endsAt" type="datetime-local" required />
              <Field label="Note (private)" name="reason" className="sm:col-span-2" />
              <div><Submit>Add</Submit></div>
            </ActionForm>
          </Panel>
          <Panel title="Upcoming exceptions">
            {exceptions.length ? (
              <ul className="divide-y text-sm">
                {exceptions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span><StatusBadge status={e.kind} tone={e.kind === "extra_hours" ? "green" : "amber"} /> <span className="ml-1">{formatDateTime(e.starts_at, biz.timezone)} → {formatDateTime(e.ends_at, biz.timezone)}</span><span className="block text-xs text-muted-foreground">{e.service ?? "All services"}{e.reason ? ` · ${e.reason}` : ""}</span></span>
                    <ActionButton action={deleteExceptionAction} fields={{ id: e.id }} label="Remove" />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None scheduled.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
