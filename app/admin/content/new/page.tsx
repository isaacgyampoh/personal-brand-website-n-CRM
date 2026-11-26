import { requireStaffPage } from "@/lib/auth/session";
import { categories } from "@/features/content/application/articles";
import { aiAvailable } from "@/features/ai/application/assistant";
import { PageTitle } from "@/components/dashboard/ui";
import { ArticleEditor } from "@/components/editor/article-editor";

export const metadata = { title: "New article" };

export default async function NewArticle() {
  const user = await requireStaffPage("content:edit");
  return (
    <div>
      <PageTitle title="New article" back={{ href: "/admin/content", label: "Content" }} />
      <ArticleEditor categories={await categories()} canPublish={user.permissions.has("content:publish")} aiEnabled={await aiAvailable()}
        initial={{ id: null, title: "", slug: "", excerpt: "", body: { type: "doc", content: [] }, coverMediaId: null, videoUrl: "", categoryId: null, tags: [], authorName: user.fullName, featured: false, seoTitle: "", seoDescription: "", status: "draft", scheduledFor: "" }} />
    </div>
  );
}
