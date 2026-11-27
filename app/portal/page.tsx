import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { portalOverview } from "@/features/portal/application/portal";
import { formatDateTime } from "@/lib/time";
import { EmailLink, EmailText } from "@/components/shared/email-text";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const user = await requireUser("/portal");
  const o = await portalOverview(user.id);
  const empty = !o.appointments.length && !o.events.length && !o.courses.length && !o.products.length;
  return (
    <div className="space-y-14">
      <div>
        <p className="eyebrow eyebrow-rule">Your portal</p>
        <h1 className="display-lg mt-5">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}.</h1>
      </div>
      {empty && (
        <div className="card-frame p-8">
          <p className="display-sm">Nothing here yet.</p>
          <p className="mt-2 text-[var(--muted-ink)]">Bookings, masterclasses, courses and downloads made with <strong><EmailText email={user.email} /></strong> appear here automatically.</p>
          <div className="mt-6 flex flex-wrap gap-4"><Link href="/book" className="btn btn-primary">Book a session</Link><Link href="/masterclasses" className="btn btn-link">Upcoming masterclasses</Link></div>
        </div>
      )}
      {o.appointments.length > 0 && (
        <section aria-labelledby="up-appts">
          <h2 id="up-appts" className="eyebrow mb-5">Upcoming sessions</h2>
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {o.appointments.map((a) => <li key={a.id}><Link href="/portal/appointments" className="flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:justify-between"><span className="display-sm">{a.service}</span><span className="text-sm">{formatDateTime(a.starts_at, user ? a.customer_timezone : "UTC")}</span></Link></li>)}
          </ul>
        </section>
      )}
      {o.events.length > 0 && (
        <section aria-labelledby="up-events">
          <h2 id="up-events" className="eyebrow mb-5">Your masterclasses</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {o.events.map((e) => <li key={e.id}><Link href={`/portal/events/${e.id}`} className="card-frame block p-6 hover:border-[var(--ink)]"><p className="text-sm text-[var(--muted-ink)]">{formatDateTime(e.starts_at, e.timezone)}</p><p className="display-sm mt-2">{e.title}</p><span className="btn btn-link mt-4 !p-0">Open class page →</span></Link></li>)}
          </ul>
        </section>
      )}
      {o.courses.length > 0 && (
        <section aria-labelledby="courses">
          <h2 id="courses" className="eyebrow mb-5">Continue learning</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {o.courses.map((c) => (
              <li key={c.id}><Link href={c.last_lesson_id ? `/portal/courses/${c.slug}/${c.last_lesson_id}` : `/portal/courses/${c.slug}`} className="card-frame block p-6 hover:border-[var(--ink)]">
                <p className="display-sm">{c.title}</p>
                <div className="mt-4 h-1 bg-[var(--line)]" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><div className="h-1 bg-[var(--brand-accent)]" style={{ width: `${c.progress}%` }} /></div>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">{c.progress}% complete · {c.status === "completed" ? "Completed" : "Resume"}</p>
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {o.products.length > 0 && <p><Link href="/portal/library" className="btn btn-outline">Your library ({o.products.length})</Link></p>}
    </div>
  );
}
