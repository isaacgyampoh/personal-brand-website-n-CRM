import type { Metadata } from "next";
import Link from "next/link";
import { getPublicServices } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { priceLabel } from "@/components/website/cards";

export const metadata: Metadata = { title: "Services", alternates: { canonical: "/services" } };

export default async function ServicesPage() {
  const services = await getPublicServices();
  const groups = new Map<string, typeof services>();
  for (const s of services) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  return (
    <>
      <PageHeader eyebrow="Work together" title="Ways to *work* together" intro="Choose the format that fits where you are — from a focused strategy session to sustained private mentorship." />
      {!services.length && <EmptyState title="Services are being updated." body="Please check back soon or get in touch directly."><Link href="/contact" className="btn btn-primary">Contact</Link></EmptyState>}
      <div className="site-container pb-28">
        {[...groups].map(([category, list]) => (
          <section key={category} className="mb-20" aria-labelledby={`cat-${category}`}>
            <h2 id={`cat-${category}`} className="eyebrow mb-8 capitalize">{category.replace(/_/g, " ")}</h2>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={`/services/${s.slug}`} className="group grid gap-4 py-10 md:grid-cols-12 md:items-baseline">
                    <h3 className="display-md transition-colors group-hover:text-[var(--brand-accent)] md:col-span-5">{s.name}</h3>
                    <p className="leading-relaxed text-[var(--muted-ink)] md:col-span-4">{s.summary}</p>
                    <div className="flex items-center justify-between gap-4 md:col-span-3 md:flex-col md:items-end">
                      <span className="font-semibold">{priceLabel(s.priceMinor, s.currency, s.priceDisplay)}</span>
                      <span className="text-sm text-[var(--muted-ink)]">{s.durationMinutes} minutes</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
