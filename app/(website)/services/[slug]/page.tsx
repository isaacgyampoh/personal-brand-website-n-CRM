import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicServices } from "@/features/website/application/public-queries";
import { RichText } from "@/components/shared/rich-text";
import { priceLabel } from "@/components/website/cards";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return (await getPublicServices()).find((s) => s.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await load((await params).slug);
  return s ? { title: s.name, description: s.summary, alternates: { canonical: `/services/${s.slug}` } } : {};
}

export default async function ServicePage({ params }: Props) {
  const s = await load((await params).slug);
  if (!s) notFound();
  const action =
    s.bookingMode === "instant" ? <Link href={`/book/${s.slug}`} className="btn btn-primary w-full">Choose a time</Link>
    : s.bookingMode === "enquiry" ? <Link href={`/contact?service=${s.slug}`} className="btn btn-primary w-full">Enquire</Link>
    : null;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Service", name: s.name, description: s.summary,
    offers: s.priceMinor > 0 ? { "@type": "Offer", price: (s.priceMinor / 100).toFixed(2), priceCurrency: s.currency } : undefined,
  };
  return (
    <article className="site-container pb-28 pt-10 md:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="eyebrow mb-10"><Link href="/services" className="hover:text-[var(--brand-accent)]">Services</Link> <span aria-hidden>/</span> <span aria-current="page">{s.name}</span></nav>
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="display-xl">{s.name}</h1>
          {s.summary && <p className="lede mt-8 max-w-2xl">{s.summary}</p>}
          {s.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="img-frame mt-12 aspect-[16/10]"><img src={s.imageUrl} alt="" className="absolute inset-0 size-full object-cover" /></div>
          )}
          <div className="mt-12"><RichText doc={s.description} /></div>
        </div>
        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="card-frame sticky top-28 p-8">
            <dl className="space-y-5 text-sm">
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-4"><dt className="text-[var(--muted-ink)]">Investment</dt><dd className="font-semibold">{priceLabel(s.priceMinor, s.currency, s.priceDisplay)}</dd></div>
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-4"><dt className="text-[var(--muted-ink)]">Duration</dt><dd className="font-semibold">{s.durationMinutes} minutes</dd></div>
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-4"><dt className="text-[var(--muted-ink)]">Format</dt><dd className="font-semibold capitalize">{s.locationType.replace("_", " ")}</dd></div>
              {s.capacity > 1 && <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-4"><dt className="text-[var(--muted-ink)]">Group size</dt><dd className="font-semibold">Up to {s.capacity}</dd></div>}
            </dl>
            {action && <div className="mt-8">{action}</div>}
            {s.cancellationPolicy && <p className="mt-6 text-xs leading-relaxed text-[var(--muted-ink)]">{s.cancellationPolicy}</p>}
          </div>
        </aside>
      </div>
    </article>
  );
}
