import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { listArticlesAdmin, categories } from "@/features/content/application/articles";
import { categoryAction } from "@/features/content/presentation/actions";
import { loadSetting } from "@/features/settings/application/settings";
import { formatInZone } from "@/lib/time";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty, Panel } from "@/components/dashboard/ui";
import { ActionForm, Field, Submit } from "@/components/dashboard/forms";

export const metadata = { title: "Content" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireStaffPage("content:edit");
  const sp = await searchParams;
  const [rows, cats, biz] = await Promise.all([listArticlesAdmin({ q: sp.q, status: sp.status }), categories(), loadSetting("business")]);
  return (
    <div className="space-y-6">
      <PageTitle title="Content studio" description="Articles for your Insights page." actions={<><LinkButton href="/admin/content/calendar" variant="outline">Content calendar</LinkButton><LinkButton href="/admin/content/new">New article</LinkButton></>} />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search articles" className="h-9 rounded-lg border bg-background px-3 text-sm" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Status"><option value="">All</option>{["draft", "scheduled", "published", "archived"].map((s) => <option key={s}>{s}</option>)}</select>
        <button className="h-9 rounded-lg bg-foreground px-3 text-sm text-background">Filter</button>
      </form>
      {rows.length === 0 ? <Empty title="No articles yet" action={<LinkButton href="/admin/content/new">Write your first article</LinkButton>} /> : (
        <Table head={["Title", "Category", "Status", "Updated"]}>
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-muted/40">
              <Td><Link href={`/admin/content/${a.id}`} className="font-medium hover:underline">{a.title}</Link>{a.featured && <span className="ml-2 text-xs text-amber-700">★ featured</span>}<div className="text-xs text-muted-foreground">/{a.slug}{a.is_demo ? " · demo" : ""}</div></Td>
              <Td className="text-sm">{a.category_name ?? "—"}</Td>
              <Td><StatusBadge status={a.status} />{a.scheduled_at && <div className="text-xs text-muted-foreground">{formatInZone(a.scheduled_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}</Td>
              <Td className="text-xs text-muted-foreground">{formatInZone(a.updated_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Panel title="Categories" description={cats.map((c) => c.name).join(" · ") || "None yet"}>
        <ActionForm action={categoryAction} resetOnSuccess className="flex gap-2"><Field label="New category" name="name" required /><div className="flex items-end"><Submit variant="outline">Add</Submit></div></ActionForm>
      </Panel>
    </div>
  );
}
