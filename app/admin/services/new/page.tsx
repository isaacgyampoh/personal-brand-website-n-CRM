import { requireStaffPage } from "@/lib/auth/session";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ServiceForm } from "@/components/dashboard/service-form";

export const metadata = { title: "New service" };

export default async function NewService() {
  await requireStaffPage("bookings:manage");
  return <div className="max-w-4xl"><PageTitle title="New service" back={{ href: "/admin/services", label: "Services" }} /><Panel><ServiceForm /></Panel></div>;
}
