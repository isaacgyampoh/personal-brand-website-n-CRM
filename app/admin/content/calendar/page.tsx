import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { calendarItemAction, deleteCalendarItemAction } from "@/features/content/presentation/actions";
import { addDaysToKey, dateKey, formatInZone, fromWallClock, parseDateKey, toLocalInput } from "@/lib/time";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";
import { CopyButton } from "@/components/dashboard/copy-button";

export const metadata = { title: "Content calendar" };
const CHANNELS = [["linkedin", "LinkedIn post"], ["article", "Article"], ["newsletter", "Newsletter"], ["campaign", "Campaign"], ["instagram", "Instagram"], ["video", "Video"], ["other", "Other"]] as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaffPage("content:edit");
  const tz = (await loadSetting("business")).timezone;
  const sp = await searchParams;
  const today = dateKey(new Date(), tz);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const first = `${month}-01`;
  const { year, month: m } = parseDateKey(first);
  const nextMonth = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
  const prevMonth = m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
  const from = fromWallClock({ year, month: m, day: 1, hour: 0, minute: 0 }, tz);
  const to = fromWallClock({ ...parseDateKey(`${nextMonth}-01`), hour: 0, minute: 0 }, tz);
  const items = await db.query<{ id: string; title: string; channel: string; status: string; planned_for: Date; body: string; reminder_at: Date | null }>(
    "select * from content_calendar_items where planned_for >= $1 and planned_for < $2 order by planned_for", [from, to]);
  const offset = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return (
    <div className="space-y-6">
      <PageTitle title="Content calendar" description="Plan LinkedIn posts, articles and newsletters. Reminders are emailed to the owner. Copy-ready text is kept here — posting to LinkedIn is done by you." back={{ href: "/admin/content", label: "Content" }}
        actions={<div className="flex items-center gap-2 text-sm"><a className="rounded-lg border bg-background px-3 py-1.5" href={`?month=${prevMonth}`}>←</a><span className="font-medium">{formatInZone(from, tz, { month: "long", year: "numeric" })}</span><a className="rounded-lg border bg-background px-3 py-1.5" href={`?month=${nextMonth}`}>→</a></div>} />
      <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border md:grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="bg-muted/60 px-2 py-1.5 text-xs font-medium">{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="min-h-24 bg-background/60" />)}
        {Array.from({ length: days }, (_, i) => addDaysToKey(first, i)).map((d) => (
          <div key={d} className={`min-h-24 bg-background p-1.5 ${d === today ? "ring-2 ring-inset ring-foreground" : ""}`}>
            <p className="text-xs text-muted-foreground">{Number(d.slice(8))}</p>
            {items.filter((x) => dateKey(x.planned_for, tz) === d).map((x) => <p key={x.id} className="mt-1 truncate rounded bg-muted px-1 py-0.5 text-[11px]" title={x.title}>{x.channel === "linkedin" ? "in" : x.channel.slice(0, 2)} · {x.title}</p>)}
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel title="This month">
          {items.length ? (
            <ul className="divide-y">
              {items.map((x) => (
                <li key={x.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                      <span><span className="font-medium">{x.title}</span><span className="block text-xs text-muted-foreground">{formatInZone(x.planned_for, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {x.channel}</span></span>
                      <StatusBadge status={x.status} tone={x.status === "published" ? "green" : x.status === "ready" ? "blue" : "gray"} />
                    </summary>
                    <div className="mt-3 space-y-3">
                      {x.body && <div className="flex items-start gap-2"><p className="flex-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{x.body}</p><CopyButton text={x.body} /></div>}
                      <CalendarForm item={{ ...x, planned: toLocalInput(x.planned_for, tz), reminder: toLocalInput(x.reminder_at, tz) }} />
                      <ActionButton action={deleteCalendarItemAction} fields={{ id: x.id }} label="Delete" variant="destructive" confirm="Delete this item?" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing planned this month.</p>}
        </Panel>
        <Panel title="Plan something"><CalendarForm /></Panel>
      </div>
    </div>
  );
}

function CalendarForm({ item }: { item?: { id: string; title: string; channel: string; status: string; body: string; planned: string; reminder: string } }) {
  return (
    <ActionForm action={calendarItemAction} resetOnSuccess={!item} className="grid gap-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Title" name="title" defaultValue={item?.title} required />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Channel" name="channel" defaultValue={item?.channel ?? "linkedin"} options={CHANNELS} />
        <Select label="Status" name="status" defaultValue={item?.status ?? "idea"} options={[["idea", "Idea"], ["drafting", "Drafting"], ["ready", "Ready"], ["published", "Published"], ["skipped", "Skipped"]] as const} />
      </div>
      <Field label="Planned for" name="plannedFor" type="datetime-local" defaultValue={item?.planned} required />
      <Field label="Remind me at (optional)" name="reminderAt" type="datetime-local" defaultValue={item?.reminder} />
      <TextArea label="Copy-ready text" name="body" defaultValue={item?.body} rows={5} />
      <div><Submit>{item ? "Save" : "Add to calendar"}</Submit></div>
    </ActionForm>
  );
}
