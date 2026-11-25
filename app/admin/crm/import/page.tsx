import { requireStaffPage } from "@/lib/auth/session";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ImportForm } from "@/components/dashboard/import-form";

export const metadata = { title: "Import contacts" };

export default async function ImportPage() {
  await requireStaffPage("crm:import");
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Import contacts" back={{ href: "/admin/crm", label: "Contacts" }} description="CSV or Excel (.xlsx), up to 5,000 rows." />
      <Panel title="Columns we recognise">
        <p className="text-sm text-muted-foreground">Name (or First name + Last name), Email, Phone, Company, Job title, Tags (separated by ; or ,), Source, Consent. Existing contacts are matched by email and updated — blank cells never overwrite existing data.</p>
      </Panel>
      <Panel><ImportForm /></Panel>
    </div>
  );
}
