import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { pageById, pageRevisions } from "@/features/website/application/pages";
import { loadSetting } from "@/features/settings/application/settings";
import { pageLifecycleAction } from "@/features/website/presentation/admin-actions";
import { formatDateTime } from "@/lib/time";
import { PageTitle, Panel, StatusBadge, LinkButton, Notice } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";

export const metadata = { title: "Page" };

export default async function PageAdmin({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("website:edit");
  const { id } = await params;
  const [page, revisions, biz] = await Promise.all([pageById(id), pageRevisions(id), loadSetting("business")]);
  if (!page) notFound();
  const canPublish = user.permissions.has("website:publish");
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={page.title} description={page.slug === "home" ? "/" : `/${page.slug}`} back={{ href: "/admin/website", label: "Website" }}
        actions={<><StatusBadge status={page.status} /><LinkButton href={`/studio/${id}`}>Edit visually</LinkButton><LinkButton href={`/studio/${id}/preview`} variant="outline" target="_blank">Preview draft</LinkButton></>} />
      {page.requires_legal_review && <Notice>This is a legal page. Text you add here is not legal advice and must be reviewed by the business owner or a lawyer before publishing.</Notice>}
      <Panel title="Revision history" description="Each publish is saved. Restoring copies a version into the draft — publish to make it live.">
        {revisions.length ? (
          <ul className="divide-y text-sm">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span><span className="font-medium">{r.note ?? r.kind}</span><span className="block text-xs text-muted-foreground">{formatDateTime(r.created_at, biz.timezone)}{r.created_by_name ? ` · ${r.created_by_name}` : ""}</span></span>
                {canPublish && <ActionButton action={pageLifecycleAction} fields={{ op: "restore", pageId: id, revisionId: r.id }} label="Restore to draft" success="Restored into draft" />}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No published versions yet.</p>}
      </Panel>
      {canPublish && page.kind !== "home" && (
        <Panel title="Danger zone">
          <div className="flex gap-2">
            {page.status !== "draft" && <ActionButton action={pageLifecycleAction} fields={{ op: "unpublish", pageId: id }} label="Unpublish" confirm="Take this page offline?" />}
            {page.kind !== "legal" && <ActionButton action={pageLifecycleAction} fields={{ op: "delete", pageId: id }} label="Delete page" variant="destructive" confirm="Delete this page and its history?" />}
          </div>
        </Panel>
      )}
    </div>
  );
}
