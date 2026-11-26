import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { saveAssessmentAction } from "@/features/marketing/presentation/assessment-actions";
import { PageTitle, Panel, LinkButton } from "@/components/dashboard/ui";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";

export const metadata = { title: "Assessment" };
export default async function AssessmentAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("marketing:manage");
  const a = await db.one<{ id: string; slug: string; title: string; intro: string; definition: unknown; status: string }>("select * from assessments where id = $1", [(await params).id]);
  if (!a) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={a.title} back={{ href: "/admin/assessments", label: "Assessments" }} actions={a.status === "published" ? <LinkButton href={`/assessment/${a.slug}`} variant="outline" target="_blank">Open ↗</LinkButton> : undefined} />
      <Panel>
        <ActionForm action={saveAssessmentAction} className="grid gap-4">
          <input type="hidden" name="id" value={a.id} />
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Title" name="title" defaultValue={a.title} /><Field label="Slug" name="slug" defaultValue={a.slug} /><Select label="Status" name="status" defaultValue={a.status} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] as const} /></div>
          <TextArea label="Intro" name="intro" defaultValue={a.intro} rows={2} />
          <TextArea label="Questions, scoring categories and result bands (JSON — validated on save)" name="definition" defaultValue={JSON.stringify(a.definition, null, 2)} rows={28} className="font-mono" hint="Each option scores points in one or more categories. Results = points ÷ maximum possible, per category and overall. Bands map the overall % to a title and recommendation." />
          <div><Submit>Save</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
