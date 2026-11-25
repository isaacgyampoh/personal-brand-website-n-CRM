import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { productStatusAction } from "@/features/academy/presentation/admin-actions";
import { PageTitle, Panel, StatusBadge, LinkButton } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { ProductForm } from "@/components/dashboard/product-form";

export const metadata = { title: "Product" };
export default async function ProductAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("products:manage");
  const { id } = await params;
  const p = await db.one<Parameters<typeof ProductForm>[0]["p"] & { status: string }>("select * from products where id = $1", [id]);
  if (!p) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={p.title} back={{ href: "/admin/shop", label: "Shop" }} actions={<>
        <StatusBadge status={p.status} />
        {p.status !== "published" ? <ActionButton action={productStatusAction} fields={{ id, status: "published" }} label="Publish" variant="default" /> : <ActionButton action={productStatusAction} fields={{ id, status: "draft" }} label="Unpublish" />}
        <LinkButton href={`/shop/${p.slug}`} variant="outline" target="_blank">View ↗</LinkButton>
      </>} />
      <Panel><ProductForm p={p} /></Panel>
    </div>
  );
}
