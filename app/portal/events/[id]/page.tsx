import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { eventAccess } from "@/features/portal/application/portal";
import { formatDateTime } from "@/lib/time";
import { Countdown } from "@/components/portal/countdown";
import { FeedbackForm } from "@/components/portal/feedback-form";
import { signValue } from "@/lib/security/crypto";

export const metadata = { title: "Class" };
export const dynamic = "force-dynamic";

/** Protected Join Class page. Returns 404 to anyone without a confirmed registration. */
export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/portal/events");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await eventAccess(user.id, id);
  if (!a) notFound();
  const { event: e } = a;
  const feedbackToken = signValue(`feedback:${a.registrationId}`, Math.floor(Date.now() / 1000) + 3600);
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="eyebrow eyebrow-rule">{e.format === "online" ? "Live online" : e.format === "hybrid" ? "Hybrid" : "In person"}</p>
        <h1 className="display-lg mt-5">{e.title}</h1>
        <p className="lede mt-4">{formatDateTime(a.nextSession.starts_at, e.timezone)}</p>
        {e.status === "cancelled" && <p className="mt-6 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-red-900">This event was cancelled. Any refund due has been initiated automatically.</p>}

        <section className="card-frame mt-10 p-7" aria-labelledby="join">
          <h2 id="join" className="display-sm">Join the class</h2>
          {a.window === "too_early" && (
            <>
              <p className="mt-3 text-[var(--muted-ink)]">Joining details unlock {a.opensMinutesBefore} minutes before the start.</p>
              <Countdown to={a.nextSession.starts_at.toISOString()} />
            </>
          )}
          {a.window === "open" && a.meeting && (
            <div className="mt-4 space-y-3">
              {a.meeting.url ? <a href={a.meeting.url} target="_blank" rel="noopener noreferrer" className="btn btn-accent">Join now</a> : <p>The host will share the joining link shortly. Refresh this page.</p>}
              {(a.meeting.meetingId || a.meeting.passcode) && <p className="text-sm">{a.meeting.meetingId && <>Meeting ID: <strong>{a.meeting.meetingId}</strong> </>}{a.meeting.passcode && <>Passcode: <strong>{a.meeting.passcode}</strong></>}</p>}
              <p className="text-xs text-[var(--muted-ink)]">This link is personal to registered attendees — please don&apos;t share it.</p>
            </div>
          )}
          {e.format !== "online" && e.venue_name && <p className="mt-4">Venue: <strong>{e.venue_name}</strong>{e.venue_address ? `, ${e.venue_address}` : ""}</p>}
          {a.window === "closed" && <p className="mt-3 text-[var(--muted-ink)]">This session has ended.</p>}
          {a.instructions && <div className="mt-5 whitespace-pre-wrap border-t border-[var(--line)] pt-5 text-sm">{a.instructions}</div>}
        </section>

        {a.sessions.length > 1 && (
          <section className="mt-10"><h2 className="eyebrow mb-4">Sessions</h2>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">{a.sessions.map((s, i) => <li key={i} className="flex justify-between py-3"><span>{s.title}</span><span>{formatDateTime(s.starts_at, e.timezone)}</span></li>)}</ul>
          </section>
        )}
      </div>
      <aside className="space-y-8 lg:col-span-4 lg:col-start-9">
        <section aria-labelledby="res">
          <h2 id="res" className="eyebrow mb-4">Materials & recordings</h2>
          {a.resources.length ? (
            <ul className="space-y-2">
              {a.resources.map((r) => <li key={r.id}>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex justify-between border border-[var(--line)] p-4 hover:border-[var(--ink)]"><span>{r.title}</span><span className="text-sm capitalize text-[var(--muted-ink)]">{r.kind}</span></a> : <div className="border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted-ink)]">{r.title} — available {r.availableFrom ? formatDateTime(r.availableFrom, e.timezone) : "soon"}</div>}</li>)}
            </ul>
          ) : <p className="text-sm text-[var(--muted-ink)]">Materials will appear here.</p>}
        </section>
        {a.certificate && <Link href="/portal/certificates" className="btn btn-outline w-full">View your certificate</Link>}
        {e.feedback_enabled && a.window === "closed" && !a.feedbackGiven && <section aria-labelledby="fb"><h2 id="fb" className="eyebrow mb-4">Your feedback</h2><FeedbackForm token={feedbackToken} /></section>}
        <Link href={`/masterclasses/${e.slug}`} className="btn btn-link">Event page →</Link>
      </aside>
    </div>
  );
}
