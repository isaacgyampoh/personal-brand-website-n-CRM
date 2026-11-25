import { requireStaffPage } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { EventForm } from "@/components/dashboard/event-form";

export const metadata = { title: "New event" };

export default async function NewEvent() {
  await requireStaffPage("events:manage");
  const biz = await loadSetting("business");
  return (
    <div className="max-w-4xl">
      <PageTitle title="New masterclass" description="Saved as a draft. Add tickets and joining details, then publish." back={{ href: "/admin/events", label: "Masterclasses" }} />
      <Panel><EventForm defaultTz={biz.timezone} /></Panel>
    </div>
  );
}
