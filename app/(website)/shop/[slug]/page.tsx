import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProducts } from "@/features/website/application/public-queries";
import { integrations } from "@/lib/config/env";
import { RichText } from "@/components/shared/rich-text";
import { PurchasePanel } from "@/components/website/purchase-panel";
import { priceLabel } from "@/components/website/cards";

type Props = { params: Promise<{ slug: string }> };
const load = async (slug: string) => (await getPublicProducts()).find((p) => p.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.seo.title || p.title, description: p.seo.description || p.summary, alternates: { canonical: `/shop/${p.slug}` } } : {};
}

export default async function ProductPage({ params }: Props) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.summary, offers: { "@type": "Offer", price: (p.priceMinor / 100).toFixed(2), priceCurrency: p.currency, availability: "https://schema.org/InStock" } };
  return (
    <article className="site-container pb-28 pt-8 md:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="eyebrow mb-10"><Link href="/shop" className="hover:text-[var(--brand-accent)]">Shop</Link> <span aria-hidden>/</span> <span className="capitalize">{p.kind}</span></nav>
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="img-frame aspect-[3/4]">
            {p.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : <div className="absolute inset-0 flex items-end p-8"><span className="monogram text-8xl">{p.title.slice(0, 1)}</span></div>}
          </div>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <h1 className="display-lg">{p.title}</h1>
          {p.summary && <p className="lede mt-6">{p.summary}</p>}
          <div className="mt-10"><RichText doc={p.description} /></div>
          <div className="card-frame mt-12 p-7 md:p-8">
            <PurchasePanel type="product" slug={p.slug} priceLabel={p.isLeadMagnet ? "Free" : priceLabel(p.priceMinor, p.currency)} free={p.priceMinor === 0} paymentsReady={integrations().payments} cta={p.priceMinor === 0 ? "Send me the download" : undefined} />
          </div>
        </div>
      </div>
    </article>
  );
}
