import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { adminCreateAppointmentAction } from "@/features/bookings/presentation/admin-actions";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ActionForm, Check, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";

export const metadata = { title: "New appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ email?: string; name?: string }> }) {
  await requireStaffPage("bookings:manage");
  const sp = await searchParams;
  const [services, biz] = await Promise.all([db.query<{ id: string; name: string; duration_minutes: number }>("select id, name, duration_minutes from services where is_active order by name"), loadSetting("business")]);
  return (
    <div className="max-w-2xl">
      <PageTitle title="New appointment" description="For bookings arranged by phone, message or in person. The client receives a confirmation email." back={{ href: "/admin/bookings", label: "Bookings" }} />
      <Panel>
        <ActionForm action={adminCreateAppointmentAction} className="grid gap-4 sm:grid-cols-2">
          <Select label="Service" name="serviceId" options={services.map((s) => ({ value: s.id, label: `${s.name} (${s.duration_minutes} min)` }))} className="sm:col-span-2" />
          <Field label={`Start (${biz.timezone})`} name="startsAt" type="datetime-local" required />
          <Field label="Meeting link (optional)" name="meetingUrl" placeholder="https://" />
          <Field label="Client name" name="fullName" defaultValue={sp.name} required />
          <Field label="Client email" name="email" type="email" defaultValue={sp.email} required />
          <Field label="Phone" name="phone" />
          <TextArea label="Private notes" name="notes" rows={2} className="sm:col-span-2" />
          <Check label="Override working hours (double bookings are still prevented)" name="override" className="sm:col-span-2" />
          <p className="text-xs text-muted-foreground sm:col-span-2">Payment isn&apos;t collected here. For a paid session, record the payment on the order or share the online booking link.</p>
          <div><Submit>Create & notify client</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
