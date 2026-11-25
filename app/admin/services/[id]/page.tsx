import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { bookingRepo } from "@/features/bookings/infrastructure/repository";
import { weeklyRuleRows } from "@/features/bookings/application/admin";
import { PageTitle, Panel, LinkButton } from "@/components/dashboard/ui";
import { ServiceForm } from "@/components/dashboard/service-form";
import { HoursEditor } from "@/components/dashboard/hours-editor";

export const metadata = { title: "Service" };

export default async function EditService({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("bookings:manage");
  const { id } = await params;
  const s = await bookingRepo.serviceById(id);
  if (!s) notFound();
  const rules = await weeklyRuleRows(id);
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={s.name} back={{ href: "/admin/services", label: "Services" }} actions={<LinkButton href={`/services/${s.slug}`} variant="outline" target="_blank">View on site ↗</LinkButton>} />
      <Panel><ServiceForm s={s} /></Panel>
      <Panel title="Service-specific hours" description="Leave unset to use your business working hours.">
        <HoursEditor serviceId={id} rules={rules} allowGlobal />
      </Panel>
    </div>
  );
}
