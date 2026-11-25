import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { myEvents } from "@/features/portal/application/portal";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Masterclasses" };

export default async function MyEvents() {
  const user = await requireUser("/portal/events");
  const events = await myEvents(user.id);
  return (
    <div className="space-y-8">
      <h1 className="display-lg">Masterclasses</h1>
      {events.length ? (
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {events.map((e) => (
            <li key={e.id}>
              {e.registration_status === "confirmed" ? (
                <Link href={`/portal/events/${e.id}`} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <span><span className="display-sm block">{e.title}</span><span className="text-sm text-[var(--muted-ink)]">{e.ticket}</span></span>
                  <span className="text-sm">{e.status === "cancelled" ? "Cancelled" : formatDateTime(e.starts_at, e.timezone)}</span>
                </Link>
              ) : <div className="py-5 text-[var(--muted-ink)]">{e.title} — {e.registration_status}</div>}
            </li>
          ))}
        </ul>
      ) : <p className="text-[var(--muted-ink)]">You haven&apos;t registered for any masterclasses yet. <Link href="/masterclasses" className="underline">See what&apos;s coming up</Link>.</p>}
    </div>
  );
}
