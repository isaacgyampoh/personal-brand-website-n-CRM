import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCaseStudies } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";

export const metadata: Metadata = { title: "Case studies", alternates: { canonical: "/case-studies" } };

export default async function CaseStudiesPage() {
  const items = await getPublicCaseStudies();
  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Selected *work*" intro="Client transformations, shared with their permission." />
      {!items.length ? <EmptyState title="Case studies will be published here." /> : (
        <ul className="site-container space-y-24 pb-28">
          {items.map((c, i) => (
            <li key={c.slug}>
              <Link href={`/case-studies/${c.slug}`} className={`group grid items-center gap-10 lg:grid-cols-12 ${i % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}>
                <div className="lg:col-span-7">
                  <div className="img-frame aspect-[16/10]">
                    {c.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    ) : <span className="monogram absolute bottom-6 left-6 text-8xl">{c.title.slice(0, 1)}</span>}
                  </div>
                </div>
                <div className="lg:col-span-4 lg:col-start-9">
                  {c.clientName && <p className="eyebrow">{c.clientName}</p>}
                  <h2 className="display-md mt-4 transition-colors group-hover:text-[var(--brand-accent)]">{c.title}</h2>
                  <p className="mt-4 text-[var(--muted-ink)]">{c.summary}</p>
                  <span className="btn btn-link mt-6 !p-0">Read the story</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
