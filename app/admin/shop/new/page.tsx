import { requireStaffPage } from "@/lib/auth/session";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ProductForm } from "@/components/dashboard/product-form";

export const metadata = { title: "New product" };
export default async function NewProduct() {
  await requireStaffPage("products:manage");
  return <div className="max-w-4xl"><PageTitle title="New product" back={{ href: "/admin/shop", label: "Shop" }} /><Panel><ProductForm /></Panel></div>;
}
