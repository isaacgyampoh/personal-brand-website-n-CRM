import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { allTags, listContacts, pipelineStages } from "@/features/crm/application/admin";
import { contactFilterSchema, type ContactFilter } from "@/features/crm/domain/segments";
import { loadSetting } from "@/features/settings/application/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty, Pager } from "@/components/dashboard/ui";
import { ActionForm, Field, Submit } from "@/components/dashboard/forms";
import { saveSegmentAction } from "@/features/crm/presentation/actions";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireStaffPage("crm:view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const segment = sp.segment ? await db.one<{ filter: ContactFilter }>("select filter from segments where id = $1", [sp.segment]) : null;
  const raw = segment?.filter ?? { ...sp, followUp: sp.filter === "follow_up" ? "overdue" : sp.followUp };
  const parsed = contactFilterSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v !== undefined)));
  const f = parsed.success ? parsed.data : {};
  const [{ rows, hasMore, total }, stages, tags, segments, business] = await Promise.all([
    listContacts(f, page), pipelineStages(), allTags(),
    db.query<{ id: string; name: string }>("select id, name from segments order by name"), loadSetting("business"),
  ]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

  return (
    <div>
      <PageTitle
        title="Contacts"
        description={`${total} contact${total === 1 ? "" : "s"} match`}
        actions={<>
          {user.permissions.has("crm:import") && <LinkButton href="/admin/crm/import" variant="outline">Import</LinkButton>}
          {user.permissions.has("crm:export") && <LinkButton href={`/api/admin/export/contacts?${qs}`} variant="outline">Export CSV</LinkButton>}
          <LinkButton href="/admin/crm/new">New contact</LinkButton>
        </>}
      />

      <form className="mb-3 grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-2 lg:grid-cols-7" role="search">
        <input name="q" defaultValue={f.q} placeholder="Search name, email, company, phone" className="h-9 rounded-lg border px-3 text-sm lg:col-span-2" aria-label="Search" />
        <select name="lifecycle" defaultValue={f.lifecycle ?? ""} className="h-9 rounded-lg border px-2 text-sm" aria-label="Lifecycle">
          <option value="">All types</option><option value="lead">Leads</option><option value="customer">Customers</option><option value="partner">Partners</option>
        </select>
        <select name="stageId" defaultValue={f.stageId ?? ""} className="h-9 rounded-lg border px-2 text-sm" aria-label="Stage">
          <option value="">All stages</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="tagId" defaultValue={f.tagId ?? ""} className="h-9 rounded-lg border px-2 text-sm" aria-label="Tag">
          <option value="">All tags</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}
        </select>
        <select name="sort" defaultValue={f.sort ?? "recent"} className="h-9 rounded-lg border px-2 text-sm" aria-label="Sort">
          <option value="recent">Newest</option><option value="value">Most valuable</option><option value="activity">Recent activity</option><option value="name">Name</option>
        </select>
        <div className="flex gap-2">
          <select name="followUp" defaultValue={f.followUp ?? ""} className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm" aria-label="Follow-up">
            <option value="">Any follow-up</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option>
          </select>
          <button className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Filter</button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Segments:</span>
        {segments.map((s) => <Link key={s.id} href={`/admin/crm?segment=${s.id}`} className={`rounded-full border px-2.5 py-1 ${sp.segment === s.id ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>{s.name}</Link>)}
        <Link href="/admin/crm?sort=value&lifecycle=customer" className="rounded-full border bg-background px-2.5 py-1 hover:bg-muted">Top customers</Link>
        <Link href="/admin/crm?followUp=overdue" className="rounded-full border bg-background px-2.5 py-1 hover:bg-muted">Needs follow-up</Link>
        {Object.keys(f).length > 0 && (
          <ActionForm action={saveSegmentAction} success="Segment saved" className="ml-auto flex gap-1">
            <input type="hidden" name="filter" value={JSON.stringify(f)} />
            <Field label="" name="name" placeholder="Save filter as segment…" className="[&>span]:hidden" required />
            <Submit variant="outline" className="h-9">Save</Submit>
          </ActionForm>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="No contacts found" body="Contacts are created automatically from website forms, bookings, registrations and purchases — or add one manually." action={<LinkButton href="/admin/crm/new">New contact</LinkButton>} />
      ) : (
        <>
          <Table head={["Name", "Stage", "Tags", "Source", "Value", "Last activity"]}>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <Td>
                  <Link href={`/admin/crm/${c.id}`} className="font-medium hover:underline">{c.full_name || c.email || c.phone}</Link>
                  <div className="text-xs text-muted-foreground">{[c.email, c.company].filter(Boolean).join(" · ")}</div>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    {c.stage_name ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="size-2 rounded-full" style={{ background: c.stage_color ?? "#999" }} />{c.stage_name}</span> : <span className="text-xs text-muted-foreground">—</span>}
                    <StatusBadge status={c.lifecycle} tone={c.lifecycle === "customer" ? "green" : c.lifecycle === "partner" ? "violet" : "gray"} />
                  </div>
                </Td>
                <Td><div className="flex max-w-48 flex-wrap gap-1">{c.tags.map((t) => <span key={t.name} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t.name}</span>)}</div></Td>
                <Td className="text-xs text-muted-foreground">{c.source}{c.consent_marketing && <span className="ml-1 text-emerald-700" title="Marketing consent">✓ consent</span>}</Td>
                <Td className="tabular-nums">{c.total_spent_minor ? formatMoney(c.total_spent_minor, business.currency) : "—"}</Td>
                <Td className="text-xs text-muted-foreground">
                  {c.last_activity_at ? formatInZone(c.last_activity_at, business.timezone, { day: "numeric", month: "short" }) : "—"}
                  {c.next_follow_up_at && <div className={new Date(c.next_follow_up_at) < new Date() ? "font-medium text-red-600" : ""}>Follow up {formatInZone(c.next_follow_up_at, business.timezone, { day: "numeric", month: "short" })}</div>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} hasMore={hasMore} base={`/admin/crm?${qs}`} />
        </>
      )}
    </div>
  );
}
