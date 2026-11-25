import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appointmentByManageToken } from "@/features/bookings/application/booking";
import { bookingRepo } from "@/features/bookings/infrastructure/repository";
import { withinCustomerCutoff } from "@/features/bookings/domain/availability";
import { formatDateTime } from "@/lib/time";
import { ManageBooking } from "@/components/website/manage-booking";

export const metadata: Metadata = { title: "Manage booking", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await appointmentByManageToken(token);
  if (!a) notFound();
  const s = (await bookingRepo.serviceById(a.service_id))!;
  const active = a.status === "confirmed";
  return (
    <div className="site-container max-w-3xl pb-28 pt-12 md:pt-20">
      <p className="eyebrow eyebrow-rule">Booking {a.reference}</p>
      <h1 className="display-lg mt-6">{s.name}</h1>
      <p className="lede mt-4">{formatDateTime(a.starts_at, a.customer_timezone)}</p>
      <p className="mt-2 text-sm capitalize text-[var(--muted-ink)]">Status: {a.status.replace("_", " ")}</p>
      {active && s.location_type === "online" && a.meeting_url && (
        <p className="mt-6 text-sm">Joining link: <a className="underline" href={a.meeting_url} target="_blank" rel="noopener noreferrer">{a.meeting_url}</a></p>
      )}
      {active ? (
        <ManageBooking
          token={token}
          serviceSlug={s.slug}
          canCancel={withinCustomerCutoff(a.starts_at, s.cancel_cutoff_hours)}
          canReschedule={withinCustomerCutoff(a.starts_at, s.reschedule_cutoff_hours) && a.reschedule_count < s.max_reschedules}
          cancelCutoff={s.cancel_cutoff_hours}
          policy={s.cancellation_policy}
        />
      ) : (
        <p className="mt-10 text-[var(--muted-ink)]">This booking can no longer be changed online.</p>
      )}
    </div>
  );
}
