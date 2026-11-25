import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/database/pool";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Booking confirmed", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookingConfirmed({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const a = ref && /^BK-[A-Z0-9]{8}$/.test(ref)
    ? await db.one<{ status: string; starts_at: Date; customer_timezone: string; name: string }>(
        "select a.status, a.starts_at, a.customer_timezone, s.name from appointments a join services s on s.id = a.service_id where a.reference = $1",
        [ref],
      )
    : null;
  const confirmed = a?.status === "confirmed";
  return (
    <div className="site-container max-w-3xl pb-28 pt-16 md:pt-24">
      <p className="eyebrow eyebrow-rule">{confirmed ? "Confirmed" : "Booking"}</p>
      <h1 className="display-lg mt-6">{confirmed ? <>You&apos;re <em>booked</em>.</> : "We're processing your booking."}</h1>
      {a && <p className="lede mt-6">{a.name} — {formatDateTime(a.starts_at, a.customer_timezone)}</p>}
      <p className="mt-6 text-[var(--muted-ink)]">
        {confirmed ? "A confirmation email with your calendar invitation and a link to manage your booking is on its way." : "If you completed payment, your confirmation will arrive by email shortly."}
      </p>
      <div className="mt-10 flex flex-wrap gap-6"><Link href="/" className="btn btn-primary">Back to home</Link><Link href="/portal" className="btn btn-link">Go to your portal</Link></div>
    </div>
  );
}
