import type { Metadata } from "next";
import Link from "next/link";
import { getPublicTestimonials } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";

export const metadata: Metadata = { title: "Testimonials", alternates: { canonical: "/testimonials" } };

export default async function TestimonialsPage() {
  const items = await getPublicTestimonials();
  return (
    <>
      <PageHeader eyebrow="Kind words" title="In their *words*" intro="Shared by clients, with their permission." />
      {!items.length ? <EmptyState title="Testimonials will be shared here." /> : (
        <div className="site-container columns-1 gap-10 pb-20 md:columns-2 lg:columns-3">
          {items.map((t) => (
            <figure key={t.id} className="mb-10 break-inside-avoid border-t border-[var(--line)] pt-8">
              <blockquote className="text-[1.08rem] leading-relaxed">“{t.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-4 text-sm">
                {t.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.photoUrl} alt="" className="size-11 rounded-full object-cover" loading="lazy" />
                )}
                <span><span className="block font-semibold">{t.authorName}</span><span className="text-[var(--muted-ink)]">{[t.authorTitle, t.company].filter(Boolean).join(", ")}</span></span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="site-container pb-28"><Link href="/testimonials/share" className="btn btn-link">Worked with me? Share your experience →</Link></div>
    </>
  );
}
