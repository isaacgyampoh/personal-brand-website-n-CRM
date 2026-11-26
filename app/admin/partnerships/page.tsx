import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { opportunityAction, submissionStatusAction } from "@/features/proof/presentation/actions";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";

export const metadata = { title: "Partnerships" };
const STAGES = ["enquiry", "qualifying", "proposal", "negotiation", "confirmed", "completed", "declined"] as const;
const KINDS = [["speaking", "Speaking"], ["corporate_training", "Corporate training"], ["sponsorship", "Sponsorship"], ["brand_partnership", "Brand partnership"], ["collaboration", "Collaboration"], ["media", "Media"], ["event_invitation", "Event invitation"]] as const;

export default async function Partnerships({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("crm:view");
  const tab = (await searchParams).tab ?? "pipeline";
  const biz = await loadSetting("business");
  const [opps, subs] = await Promise.all([
    db.query<{ id: string; kind: string; title: string; organisation: string; stage: string; fee_minor: number | null; currency: string; event_date: string | null; next_follow_up_at: string | null; contact_id: string | null; notes: string }>(
      "select id, kind, title, organisation, stage, fee_minor, currency, event_date::text, next_follow_up_at::date::text, contact_id, notes from opportunities order by coalesce(next_follow_up_at, created_at)"),
    db.query<{ id: string; form: string; payload: Record<string, string>; status: string; created_at: Date; contact_id: string | null }>("select * from form_submissions order by status = 'new' desc, created_at desc limit 100"),
  ]);
  const pipelineValue = opps.filter((o) => !["declined", "completed"].includes(o.stage)).reduce((s, o) => s + (o.fee_minor ?? 0), 0);
  return (
    <div className="space-y-6">
      <PageTitle title="Speaking & partnerships" description={`Open pipeline value: ${formatMoney(pipelineValue, biz.currency)}`} />
      <nav className="flex gap-1 border-b">{[["pipeline", "Pipeline"], ["enquiries", `Enquiries (${subs.filter((s) => s.status === "new").length} new)`]].map(([k, l]) => <Link key={k} href={`/admin/partnerships?tab=${k}`} className={`border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>)}</nav>
      {tab === "pipeline" ? (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-2"><div className="flex min-w-max gap-3">
            {STAGES.map((st) => (
              <section key={st} className="w-64 shrink-0 rounded-xl border bg-background" aria-label={st}>
                <header className="border-b px-3 py-2 text-sm font-semibold capitalize">{st} <span className="text-xs font-normal text-muted-foreground">({opps.filter((o) => o.stage === st).length})</span></header>
                <ul className="space-y-2 p-2">
                  {opps.filter((o) => o.stage === st).map((o) => (
                    <li key={o.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.organisation} · {o.kind.replace("_", " ")}</p>
                      {o.fee_minor !== null && <p className="mt-1 text-xs">{formatMoney(o.fee_minor, o.currency)}</p>}
                      {o.event_date && <p className="text-xs text-muted-foreground">Event {o.event_date}</p>}
                      {o.next_follow_up_at && <p className={`text-xs ${o.next_follow_up_at < new Date().toISOString().slice(0, 10) ? "font-medium text-red-600" : "text-muted-foreground"}`}>Follow up {o.next_follow_up_at}</p>}
                      {o.contact_id && <Link className="text-xs underline" href={`/admin/crm/${o.contact_id}`}>Contact</Link>}
                      <ActionForm action={opportunityAction} success="Moved" className="mt-2">
                        <input type="hidden" name="op" value="stage" /><input type="hidden" name="id" value={o.id} />
                        <select name="stage" defaultValue={o.stage} className="h-8 w-full rounded border px-1 text-xs" aria-label="Stage">{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                        <Submit variant="outline" className="mt-1 h-7 w-full text-xs">Move</Submit>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div></div>
          <Panel title="Add opportunity">
            <ActionForm action={opportunityAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
              <Select label="Type" name="kind" options={KINDS} /><Field label="Title" name="title" required /><Field label="Organisation" name="organisation" />
              <Field label="Fee" name="fee" /><Field label="Currency" name="currency" defaultValue={biz.currency} /><Field label="Event date" name="eventDate" type="date" />
              <Field label="Location" name="location" /><Field label="Next follow-up" name="nextFollowUpAt" type="date" />
              <TextArea label="Notes" name="notes" rows={2} className="sm:col-span-3" />
              <div><Submit>Add</Submit></div>
            </ActionForm>
          </Panel>
        </>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <Panel key={s.id} title={`${s.payload.fullName ?? "Unknown"} — ${s.form.replace("_", " ")}`} description={`${s.payload.email ?? ""} · ${formatInZone(s.created_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} actions={<StatusBadge status={s.status} tone={s.status === "new" ? "blue" : "gray"} />}>
              <p className="whitespace-pre-wrap text-sm">{s.payload.message}</p>
              {s.payload.organisation && <p className="mt-2 text-xs text-muted-foreground">Organisation: {s.payload.organisation}{s.payload.eventDate ? ` · Date: ${s.payload.eventDate}` : ""}{s.payload.budget ? ` · Budget: ${s.payload.budget}` : ""}</p>}
              <div className="mt-3 flex gap-2">
                {s.contact_id && <Link href={`/admin/crm/${s.contact_id}`} className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs">Open contact</Link>}
                {s.payload.email && <a href={`mailto:${s.payload.email}`} className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs">Reply</a>}
                {s.status === "new" && <ActionButton action={submissionStatusAction} fields={{ id: s.id, status: "reviewed" }} label="Mark reviewed" />}
                <ActionButton action={submissionStatusAction} fields={{ id: s.id, status: "spam" }} label="Spam" variant="secondary" />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
