import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { appearanceAction, caseStudyAction, testimonialAction, topicAction } from "@/features/proof/presentation/actions";
import { PageTitle, Panel, StatusBadge, Notice } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Check, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";
import { MediaPicker } from "@/components/dashboard/media-picker";
import { plainText } from "@/features/content/domain/rich-text";

export const metadata = { title: "Testimonials & press" };
const TABS = [["testimonials", "Testimonials"], ["cases", "Case studies"], ["press", "Press & appearances"], ["topics", "Speaking topics"]] as const;

export default async function ProofAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("content:edit");
  const tab = (await searchParams).tab ?? "testimonials";
  return (
    <div className="space-y-6">
      <PageTitle title="Testimonials, case studies & press" description="Only real, approved and consented content is ever shown on the website." />
      <nav className="flex gap-1 overflow-x-auto border-b">{TABS.map(([k, l]) => <Link key={k} href={`/admin/proof?tab=${k}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>)}</nav>
      {tab === "testimonials" && <Testimonials />}
      {tab === "cases" && <Cases />}
      {tab === "press" && <Press />}
      {tab === "topics" && <Topics />}
    </div>
  );
}

async function Testimonials() {
  const rows = await db.query<{ id: string; author_name: string; author_title: string; company: string; quote: string; status: string; consent_confirmed: boolean; consent_note: string; featured: boolean; source: string; submitted_by_email: string | null }>("select * from testimonials order by status = 'pending' desc, created_at desc");
  return (
    <div className="space-y-4">
      <Notice tone="blue">Collect testimonials at <span className="font-mono">/testimonials/share</span>. Approval requires recorded consent (enforced by the database).</Notice>
      {rows.map((t) => (
        <Panel key={t.id} title={`${t.author_name}${t.company ? ` — ${t.company}` : ""}`} description={`${t.source}${t.submitted_by_email ? ` · ${t.submitted_by_email}` : ""} · consent: ${t.consent_confirmed ? `yes${t.consent_note ? ` (${t.consent_note})` : ""}` : "NOT recorded"}`} actions={<div className="flex items-center gap-2"><StatusBadge status={t.status} />{t.featured && <StatusBadge status="featured" tone="violet" />}</div>}>
          <blockquote className="text-sm">“{t.quote}”</blockquote>
          <div className="mt-3 flex flex-wrap gap-2">
            {t.status !== "approved" && <ActionButton action={testimonialAction} fields={{ op: "approve", id: t.id }} label="Approve" variant="default" />}
            {t.status !== "rejected" && <ActionButton action={testimonialAction} fields={{ op: "reject", id: t.id }} label="Reject" />}
            {t.status === "approved" && <ActionButton action={testimonialAction} fields={{ op: "feature", id: t.id }} label={t.featured ? "Unfeature" : "Feature on homepage"} />}
            <ActionButton action={testimonialAction} fields={{ op: "delete", id: t.id }} label="Delete" variant="destructive" confirm="Delete permanently?" />
          </div>
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Edit / record consent</summary>
            <ActionForm action={testimonialAction} className="mt-3 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="op" value="save" /><input type="hidden" name="id" value={t.id} />
              <Field label="Name" name="authorName" defaultValue={t.author_name} /><Field label="Title" name="authorTitle" defaultValue={t.author_title} /><Field label="Company" name="company" defaultValue={t.company} />
              <TextArea label="Quote" name="quote" defaultValue={t.quote} className="sm:col-span-3" />
              <Check label="The person gave permission to publish" name="consentConfirmed" defaultChecked={t.consent_confirmed} />
              <Field label="How consent was given (e.g. email 3 Dec)" name="consentNote" defaultValue={t.consent_note} className="sm:col-span-2" />
              <div><Submit variant="outline">Save</Submit></div>
            </ActionForm>
          </details>
        </Panel>
      ))}
      <Panel title="Add a testimonial you received elsewhere">
        <ActionForm action={testimonialAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="op" value="create" />
          <Field label="Name" name="authorName" required /><Field label="Title" name="authorTitle" /><Field label="Company" name="company" />
          <TextArea label="Quote (exact words)" name="quote" required className="sm:col-span-3" />
          <MediaPicker name="photoMediaId" label="Photo (optional, with permission)" />
          <Check label="I have the person's permission to publish" name="consentConfirmed" />
          <Field label="How consent was given" name="consentNote" />
          <div><Submit>Add (as pending)</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}

async function Cases() {
  const rows = await db.query<{ id: string; title: string; client_name: string; summary: string; challenge: unknown; approach: unknown; outcome: unknown; cover_media_id: string | null; consent_confirmed: boolean; status: string }>("select * from case_studies order by created_at desc");
  return (
    <div className="space-y-4">
      {rows.map((c) => <Panel key={c.id} title={c.title} actions={<StatusBadge status={c.status} />}><details><summary className="cursor-pointer text-sm text-muted-foreground">Edit</summary><div className="mt-3"><CaseForm c={c} /></div></details></Panel>)}
      <Panel title="New case study"><CaseForm /></Panel>
    </div>
  );
}

async function Press() {
  const rows = await db.query<{ id: string; kind: string; title: string; outlet: string; appeared_on: string | null; published: boolean }>("select id, kind, title, outlet, appeared_on::text, published from media_appearances order by appeared_on desc nulls last");
  return (
    <div className="space-y-4">
      <Panel title="Appearances">{rows.length ? <ul className="divide-y text-sm">{rows.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span><StatusBadge status={r.kind} tone="blue" /> <span className="ml-1 font-medium">{r.title}</span> · {r.outlet} {r.appeared_on && <span className="text-muted-foreground">({r.appeared_on})</span>}{!r.published && <span className="ml-2 text-xs text-muted-foreground">hidden</span>}</span><ActionButton action={appearanceAction} fields={{ op: "delete", id: r.id }} label="Remove" /></li>)}</ul> : <p className="text-sm text-muted-foreground">None yet.</p>}</Panel>
      <Panel title="Add appearance">
        <ActionForm action={appearanceAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
          <Select label="Type" name="kind" options={[["interview", "Interview"], ["podcast", "Podcast"], ["video", "Video"], ["press", "Press coverage"], ["speaking_engagement", "Speaking engagement"]] as const} />
          <Field label="Title" name="title" required /><Field label="Outlet / event" name="outlet" />
          <Field label="Link (https://)" name="url" /><Field label="Date" name="appearedOn" type="date" />
          <TextArea label="Description" name="description" rows={2} className="sm:col-span-3" />
          <Check label="Show on website" name="published" defaultChecked /><Check label="Featured" name="featured" />
          <div><Submit>Add</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}

async function Topics() {
  const rows = await db.query<{ id: string; title: string; audience: string }>("select id, title, audience from speaking_topics order by position");
  return (
    <div className="space-y-4">
      <Panel title="Speaking topics">{rows.length ? <ul className="divide-y text-sm">{rows.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span className="font-medium">{r.title}<span className="block text-xs font-normal text-muted-foreground">{r.audience}</span></span><ActionButton action={topicAction} fields={{ op: "delete", id: r.id }} label="Remove" /></li>)}</ul> : <p className="text-sm text-muted-foreground">None yet.</p>}</Panel>
      <Panel title="Add topic">
        <ActionForm action={topicAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" name="title" required /><Field label="Audience" name="audience" />
          <TextArea label="Description" name="description" className="sm:col-span-2" /><Field label="Formats (comma-separated)" name="formats" placeholder="Keynote, Workshop, Panel" />
          <div className="flex items-end"><Submit>Add</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}

type CaseRow = { id: string; title: string; client_name: string; summary: string; challenge: unknown; approach: unknown; outcome: unknown; cover_media_id: string | null; consent_confirmed: boolean; status: string };

function CaseForm({ c }: { c?: CaseRow }) {
  return (
    <ActionForm action={caseStudyAction} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Title" name="title" defaultValue={c?.title} required /><Field label="Client (as they wish to be named)" name="clientName" defaultValue={c?.client_name} />
      <TextArea label="Summary" name="summary" defaultValue={c?.summary} rows={2} className="sm:col-span-2" />
      <TextArea label="The challenge" name="challenge" defaultValue={c ? plainText(c.challenge) : ""} rows={3} />
      <TextArea label="The approach" name="approach" defaultValue={c ? plainText(c.approach) : ""} rows={3} />
      <TextArea label="The outcome (real, verifiable results only)" name="outcome" defaultValue={c ? plainText(c.outcome) : ""} rows={3} className="sm:col-span-2" />
      <MediaPicker name="coverMediaId" label="Cover image" defaultId={c?.cover_media_id ?? ""} />
      <div className="space-y-3"><Select label="Status" name="status" defaultValue={c?.status ?? "draft"} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] as const} /><Check label="Client approved publication" name="consentConfirmed" defaultChecked={c?.consent_confirmed} /></div>
      <div><Submit>{c ? "Save" : "Create"}</Submit></div>
    </ActionForm>
  );
}
