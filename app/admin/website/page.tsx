import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { listPages } from "@/features/website/application/pages";
import { loadSetting } from "@/features/settings/application/settings";
import { pageLifecycleAction } from "@/features/website/presentation/admin-actions";
import { formatInZone } from "@/lib/time";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Panel } from "@/components/dashboard/ui";
import { ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";

export const metadata = { title: "Website" };

export default async function WebsiteAdmin() {
  await requireStaffPage("website:edit");
  const [pages, biz] = await Promise.all([listPages(), loadSetting("business")]);
  return (
    <div className="space-y-6">
      <PageTitle title="Website" description="Edit pages visually. Changes stay in draft until you publish — no redeploy needed."
        actions={<><LinkButton href="/admin/website/design" variant="outline">Brand & design</LinkButton><LinkButton href="/admin/website/navigation" variant="outline">Navigation, banner & links</LinkButton><LinkButton href="/" variant="outline" target="_blank">View site ↗</LinkButton></>} />
      <Table head={["Page", "Address", "Status", "Last change", ""]}>
        {pages.map((p) => (
          <tr key={p.id} className="hover:bg-muted/40">
            <Td><Link href={`/admin/website/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.requires_legal_review && <div className="text-xs text-amber-700">Requires legal review before publishing</div>}{p.is_demo && <div className="text-xs text-muted-foreground">Demo content</div>}</Td>
            <Td className="font-mono text-xs">{p.slug === "home" ? "/" : `/${p.slug}`}</Td>
            <Td><StatusBadge status={p.status} />{p.scheduled_publish_at && <div className="mt-1 text-xs text-muted-foreground">{formatInZone(p.scheduled_publish_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}</Td>
            <Td className="text-xs text-muted-foreground">{formatInZone(p.updated_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
            <Td><LinkButton href={`/studio/${p.id}`} size="sm">Edit visually</LinkButton></Td>
          </tr>
        ))}
      </Table>
      <Panel title="New page" description="Landing pages for campaigns and promotions, or extra content pages.">
        <ActionForm action={pageLifecycleAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="op" value="create" />
          <Field label="Title" name="title" required />
          <Field label="Address (slug)" name="slug" placeholder="e.g. linkedin-bootcamp" required />
          <Select label="Type" name="kind" options={[["landing", "Landing page"], ["standard", "Standard page"], ["legal", "Legal page"]] as const} />
          <div className="flex items-end"><Submit>Create & edit</Submit></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
