import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { articleById, categories } from "@/features/content/application/articles";
import { restoreArticleRevisionAction } from "@/features/content/presentation/actions";
import { loadSetting } from "@/features/settings/application/settings";
import { integrations } from "@/lib/config/env";
import { db } from "@/lib/database/pool";
import { formatDateTime, toLocalInput } from "@/lib/time";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { ArticleEditor } from "@/components/editor/article-editor";

export const metadata = { title: "Edit article" };

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("content:edit");
  const { id } = await params;
  const [a, cats, biz] = await Promise.all([articleById(id), categories(), loadSetting("business")]);
  if (!a) notFound();
  const revisions = await db.query<{ id: string; title: string; created_at: Date }>("select id, title, created_at from article_revisions where article_id = $1 order by created_at desc limit 15", [id]);
  return (
    <div className="space-y-6">
      <PageTitle title={a.title} back={{ href: "/admin/content", label: "Content" }} />
      <ArticleEditor key={a.updated_at.toISOString()} categories={cats} canPublish={user.permissions.has("content:publish")} aiEnabled={integrations().ai}
        initial={{ id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body, coverMediaId: a.cover_media_id, videoUrl: a.video_url ?? "", categoryId: a.category_id, tags: a.tags ?? [], authorName: a.author_name, featured: a.featured, seoTitle: a.seo?.title ?? "", seoDescription: a.seo?.description ?? "", status: a.status, scheduledFor: toLocalInput(a.scheduled_at, biz.timezone) }} />
      {revisions.length > 0 && (
        <Panel title="Revisions">
          <ul className="divide-y text-sm">{revisions.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.title}<span className="block text-xs text-muted-foreground">{formatDateTime(r.created_at, biz.timezone)}</span></span><ActionButton action={restoreArticleRevisionAction} fields={{ revisionId: r.id }} label="Restore" confirm="Replace the current text with this revision?" /></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}
