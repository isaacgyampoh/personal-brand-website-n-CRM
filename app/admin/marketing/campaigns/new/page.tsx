import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { CampaignForm } from "@/components/dashboard/campaign-form";

export const metadata = { title: "New campaign" };
export default async function NewCampaign() {
  await requireStaffPage("marketing:manage");
  const [lists, tags] = await Promise.all([db.query<{ id: string; name: string }>("select id, name from mailing_lists order by name"), db.query<{ id: string; name: string }>("select id, name::text from crm_tags order by name")]);
  return <div className="max-w-3xl"><PageTitle title="New email campaign" back={{ href: "/admin/marketing", label: "Marketing" }} /><Panel><CampaignForm lists={lists} tags={tags} /></Panel></div>;
}
