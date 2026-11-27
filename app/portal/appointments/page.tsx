import { requireUser } from "@/lib/auth/session";
import { myAppointments } from "@/features/portal/application/portal";
import { withinCustomerCutoff } from "@/features/bookings/domain/availability";
import { formatDateTime } from "@/lib/time";
import { PortalAppointment } from "@/components/portal/portal-appointment";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const user = await requireUser("/portal/appointments");
  const appts = await myAppointments(user.id);
  const upcoming = appts.filter((a) => a.status === "confirmed" && a.ends_at > new Date()).reverse();
  const past = appts.filter((a) => !upcoming.includes(a));
  return (
    <div className="space-y-12">
      <h1 className="display-lg">Appointments</h1>
      <section aria-labelledby="up">
        <h2 id="up" className="eyebrow mb-5">Upcoming</h2>
        {upcoming.length ? (
          <ul className="space-y-4">
            {upcoming.map((a) => (
              <li key={a.id} className="card-frame p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="display-sm">{a.service}</p>
                    <p className="mt-1">{formatDateTime(a.starts_at, a.customer_timezone)}</p>
                    <p className="text-sm text-[var(--muted-ink)]">Ref {a.reference}</p>
                  </div>
                  {a.location_type === "online" && (a.meeting_url ? <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="btn btn-accent">Join meeting</a> : <span className="text-sm text-[var(--muted-ink)]">Joining link will appear here before your session.</span>)}
                </div>
                {a.meeting_details && <p className="mt-4 whitespace-pre-wrap text-sm">{a.meeting_details}</p>}
                <PortalAppointment id={a.id} serviceSlug={a.service_slug} timezone={a.customer_timezone}
                  canCancel={withinCustomerCutoff(a.starts_at, a.cancel_cutoff_hours)}
                  canReschedule={withinCustomerCutoff(a.starts_at, a.reschedule_cutoff_hours) && a.reschedule_count < a.max_reschedules} />
              </li>
            ))}
          </ul>
        ) : <p className="text-[var(--muted-ink)]">No upcoming appointments.</p>}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past">
          <h2 id="past" className="eyebrow mb-5">History</h2>
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
            {past.map((a) => <li key={a.id} className="flex justify-between gap-4 py-4"><span>{a.service}<span className="block text-[var(--muted-ink)]">{formatDateTime(a.starts_at, a.customer_timezone)}</span></span><span className="capitalize">{a.status.replace("_", " ")}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
