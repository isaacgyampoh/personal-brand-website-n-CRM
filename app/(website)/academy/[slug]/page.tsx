import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCourses } from "@/features/website/application/public-queries";
import { paymentsReady } from "@/features/payments/application/gateway";
import { RichText } from "@/components/shared/rich-text";
import { PurchasePanel } from "@/components/website/purchase-panel";
import { priceLabel } from "@/components/website/cards";

type Props = { params: Promise<{ slug: string }> };
const load = async (slug: string) => (await getPublicCourses()).find((c) => c.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return {};
  return { title: c.seo.title || c.title, description: c.seo.description || c.summary, alternates: { canonical: `/academy/${c.slug}` }, robots: c.visibility === "unlisted" ? { index: false } : undefined };
}

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.max(1, Math.round(s / 60))} min`);

export default async function CoursePage({ params }: Props) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const jsonLd = { "@context": "https://schema.org", "@type": "Course", name: c.title, description: c.summary, provider: { "@type": "Organization", name: process.env.APP_URL } };
  return (
    <article className="site-container pb-28 pt-8 md:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="eyebrow mb-10"><Link href="/academy" className="hover:text-[var(--brand-accent)]">Academy</Link> <span aria-hidden>/</span> {c.category}</nav>
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="display-xl">{c.title}</h1>
          {c.subtitle && <p className="lede mt-6">{c.subtitle}</p>}
          <p className="mt-6 text-sm text-[var(--muted-ink)]">{c.lessonCount} lessons{c.totalSeconds ? ` · ${dur(c.totalSeconds)}` : ""} · <span className="capitalize">{c.level}</span>{c.certificateEnabled ? " · Certificate of completion" : ""}</p>
          {c.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="img-frame mt-10 aspect-[16/9]"><img src={c.coverUrl} alt="" className="absolute inset-0 size-full object-cover" /></div>
          )}
          {c.outcomes.length > 0 && (
            <section className="mt-14"><h2 className="eyebrow mb-6">You will</h2>
              <ul className="grid gap-4 sm:grid-cols-2">{c.outcomes.map((o, i) => <li key={i} className="flex gap-3 border-t border-[var(--line)] pt-4"><span className="text-[var(--brand-accent)]" aria-hidden>—</span>{o}</li>)}</ul>
            </section>
          )}
          <div className="mt-14"><RichText doc={c.description} /></div>
          {c.modules.length > 0 && (
            <section className="mt-16" aria-labelledby="curriculum">
              <h2 id="curriculum" className="display-sm mb-6">Curriculum</h2>
              <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {c.modules.map((m, i) => (
                  <details key={i} className="group" open={i === 0}>
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
                      <span><span className="mr-3 font-display text-lg text-[var(--muted-ink)]">{String(i + 1).padStart(2, "0")}</span>{m.title}</span>
                      <span className="text-sm font-normal text-[var(--muted-ink)]">{m.lessons.length} lessons</span>
                    </summary>
                    <ul className="pb-4">
                      {m.lessons.map((l, j) => (
                        <li key={j} className="flex justify-between gap-4 py-2 pl-10 text-sm">
                          <span>{l.title} {l.isPreview && <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">Preview</span>}</span>
                          <span className="capitalize text-[var(--muted-ink)]">{l.durationSeconds ? dur(l.durationSeconds) : l.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="card-frame sticky top-28 p-7 md:p-8">
            <PurchasePanel type="course" slug={c.slug} priceLabel={priceLabel(c.priceMinor, c.currency)} free={c.priceMinor === 0} paymentsReady={await paymentsReady()} cta={c.priceMinor === 0 ? "Enrol for free" : undefined} />
          </div>
        </aside>
      </div>
    </article>
  );
}
