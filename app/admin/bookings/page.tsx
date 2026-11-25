import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { listAppointments } from "@/features/bookings/application/admin";
import { loadSetting } from "@/features/settings/application/settings";
import { addDaysToKey, dateKey, formatInZone, fromWallClock, parseDateKey } from "@/lib/time";
import { PageTitle, StatusBadge, LinkButton, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ week?: string; status?: string; q?: string; view?: string }> }) {
  const user = await requireStaffPage("bookings:view");
  const sp = await searchParams;
  const tz = (await loadSetting("business")).timezone;
  const today = dateKey(new Date(), tz);
  const base = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  const { year, month, day } = parseDateKey(base);
  const dow = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const monday = addDaysToKey(base, -dow);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
  const at = (k: string) => { const p = parseDateKey(k); return fromWallClock({ ...p, hour: 0, minute: 0 }, tz); };
  const list = sp.view === "list";
  const from = list ? new Date() : at(monday);
  const to = list ? new Date(Date.now() + 90 * 86400_000) : at(addDaysToKey(monday, 7));
  const appts = await listAppointments({ from, to, status: sp.status || undefined, q: sp.q || undefined });
  const byDay = new Map<string, typeof appts>();
  for (const a of appts) { const k = dateKey(a.starts_at, tz); byDay.set(k, [...(byDay.get(k) ?? []), a]); }
  const qs = (w: string) => `/admin/bookings?week=${w}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <div>
      <PageTitle title="Bookings" description={`Times shown in ${tz}`} actions={<>
        <LinkButton href="/admin/bookings/availability" variant="outline">Availability</LinkButton>
        {user.permissions.has("bookings:manage") && <LinkButton href="/admin/bookings/new">New appointment</LinkButton>}
      </>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={qs(addDaysToKey(monday, -7))} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 hover:bg-muted" aria-label="Previous week">←</Link>
          <Link href={qs(today)} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 hover:bg-muted">Today</Link>
          <Link href={qs(addDaysToKey(monday, 7))} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 hover:bg-muted" aria-label="Next week">→</Link>
          <span className="ml-2 font-medium">{list ? "Next 90 days" : `${formatInZone(at(monday), tz, { day: "numeric", month: "short" })} – ${formatInZone(at(days[6]), tz, { day: "numeric", month: "short", year: "numeric" })}`}</span>
        </div>
        <form className="flex flex-wrap gap-2">
          {sp.week && <input type="hidden" name="week" value={sp.week} />}
          <input name="q" defaultValue={sp.q} placeholder="Name, email or reference" className="h-9 rounded-lg border bg-background px-3 text-sm" aria-label="Search" />
          <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Status">
            <option value="">All statuses</option>{["confirmed", "pending_payment", "completed", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select name="view" defaultValue={sp.view ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="View"><option value="">Week</option><option value="list">Upcoming list</option></select>
          <button className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Apply</button>
        </form>
      </div>

      {list ? (
        appts.length ? (
          <ul className="divide-y rounded-xl border bg-background">
            {appts.map((a) => <li key={a.id}><Row a={a} tz={tz} showDate /></li>)}
          </ul>
        ) : <Empty title="No upcoming appointments" />
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            return (
              <section key={d} className={`min-h-32 rounded-xl border bg-background ${d === today ? "ring-2 ring-foreground" : ""}`} aria-label={d}>
                <header className="border-b px-3 py-2 text-xs font-semibold">{formatInZone(at(d), tz, { weekday: "short", day: "numeric" })}</header>
                <ul className="space-y-1.5 p-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link href={`/admin/bookings/${a.id}`} className={`block rounded-md border-l-2 px-2 py-1.5 text-xs hover:bg-muted ${a.status === "confirmed" ? "border-emerald-500 bg-emerald-50/60" : a.status === "cancelled" ? "border-red-300 bg-muted/50 line-through opacity-60" : "border-amber-400 bg-amber-50/60"}`}>
                        <span className="font-semibold">{formatInZone(a.starts_at, tz, { hour: "2-digit", minute: "2-digit" })}</span> {a.name}
                        <span className="block truncate text-muted-foreground">{a.service}</span>
                      </Link>
                    </li>
                  ))}
                  {!items.length && <li className="px-1 py-2 text-xs text-muted-foreground">—</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ a, tz, showDate }: { a: { id: string; reference: string; starts_at: Date; status: string; service: string; name: string }; tz: string; showDate?: boolean }) {
  return (
    <Link href={`/admin/bookings/${a.id}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/40">
      <span className="min-w-0"><span className="block font-medium">{a.name}</span><span className="text-xs text-muted-foreground">{a.service} · {a.reference}</span></span>
      <span className="flex shrink-0 items-center gap-3"><span className="text-xs">{formatInZone(a.starts_at, tz, showDate ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" })}</span><StatusBadge status={a.status} /></span>
    </Link>
  );
}
