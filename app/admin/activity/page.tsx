import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { activityFeed } from "@/features/studio/application/activity";
import { formatInZone } from "@/lib/time";
import { PageTitle, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";
const TABS = [["", "Everything"], ["customers", "Customers"], ["team", "Team actions"], ["problems", "Problems"]] as const;
const DOT = { green: "bg-emerald-500", blue: "bg-sky-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-stone-400" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireStaffPage("dashboard:view", "/admin/activity");
  const kind = (await searchParams).kind ?? "";
  const [items, biz] = await Promise.all([activityFeed(user, { kind: kind || undefined, limit: 100 }), loadSetting("business")]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Activity" description="Bookings, payments, registrations and enquiries as they happen, plus team actions and delivery problems." />
      <nav className="flex gap-1 overflow-x-auto border-b">{TABS.map(([k, l]) => <Link key={k} href={k ? `/admin/activity?kind=${k}` : "/admin/activity"} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${kind === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>)}</nav>
      {items.length === 0 ? <Empty title="No activity yet" body="It appears here as clients book, register, buy and get in touch." /> : (
        <ol className="space-y-1">
          {items.map((a, i) => {
            const body = (<><span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[a.tone]}`} aria-hidden /><span className="min-w-0 flex-1"><span className="block text-sm">{a.title}</span><span className="block truncate text-xs text-muted-foreground">{a.detail}</span></span><time className="shrink-0 text-xs text-muted-foreground" dateTime={a.at.toISOString()}>{formatInZone(a.at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></>);
            return <li key={i}>{a.href ? <Link href={a.href} className="flex gap-3 rounded-lg px-3 py-2 hover:bg-muted/60">{body}</Link> : <div className="flex gap-3 px-3 py-2">{body}</div>}</li>;
          })}
        </ol>
      )}
    </div>
  );
}
