import { requireStaffPage } from "@/lib/auth/session";
import { pipelineStages } from "@/features/crm/application/admin";
import { createContactAction } from "@/features/crm/presentation/actions";
import { ContactForm } from "@/components/dashboard/contact-form";
import { PageTitle, Panel } from "@/components/dashboard/ui";

export const metadata = { title: "New contact" };

export default async function NewContact() {
  await requireStaffPage("crm:edit");
  return (
    <div className="max-w-3xl">
      <PageTitle title="New contact" back={{ href: "/admin/crm", label: "Contacts" }} />
      <Panel><ContactForm action={createContactAction} stages={await pipelineStages()} submitLabel="Create contact" /></Panel>
    </div>
  );
}
