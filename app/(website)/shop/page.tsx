import type { Metadata } from "next";
import { getPublicProducts } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { ProductCard } from "@/components/website/cards";

export const metadata: Metadata = { title: "Shop", alternates: { canonical: "/shop" } };

export default async function ShopPage() {
  const products = await getPublicProducts();
  return (
    <>
      <PageHeader eyebrow="Resources" title="Tools for your *brand*" intro="Guides, templates and workbooks to put the strategy into practice." />
      {products.length ? (
        <div className="site-container grid gap-x-8 gap-y-16 pb-28 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      ) : (
        <EmptyState title="Resources are coming soon." />
      )}
    </>
  );
}
