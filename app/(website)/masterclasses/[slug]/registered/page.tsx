import type { Metadata } from "next";
import Link from "next/link";
import { getPublicEvent } from "@/features/website/application/public-queries";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "You're registered", robots: { index: false } };

export default async function Registered({ params }: { params: Promise<{ slug: string }> }) {
  const e = await getPublicEvent((await params).slug);
  return (
    <div className="site-container max-w-3xl pb-28 pt-16 md:pt-24">
      <p className="eyebrow eyebrow-rule">Registration confirmed</p>
      <h1 className="display-lg mt-6">You&apos;re <em>in</em>.</h1>
      {e && <p className="lede mt-6">{e.title} — {formatDateTime(e.startsAt, e.timezone)}</p>}
      <p className="mt-6 text-[var(--muted-ink)]">Your confirmation and calendar invitation are on their way. Joining details will be available in your portal before the session starts — sign in with the email you registered with.</p>
      <div className="mt-10 flex flex-wrap gap-6"><Link href="/portal" className="btn btn-primary">Open your portal</Link><Link href="/masterclasses" className="btn btn-link">More sessions</Link></div>
    </div>
  );
}
