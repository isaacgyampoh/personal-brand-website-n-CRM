import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCaseStudies } from "@/features/website/application/public-queries";
import { RichText, hasRichContent } from "@/components/shared/rich-text";

type Props = { params: Promise<{ slug: string }> };
const load = async (slug: string) => (await getPublicCaseStudies()).find((c) => c.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).slug);
  return c ? { title: c.title, description: c.summary, alternates: { canonical: `/case-studies/${c.slug}` } } : {};
}

export default async function CaseStudyPage({ params }: Props) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const sections = [["The challenge", c.challenge], ["The approach", c.approach], ["The outcome", c.outcome]] as const;
  return (
    <article className="pb-28">
      <header className="site-container max-w-5xl pb-14 pt-10 md:pt-16">
        <nav aria-label="Breadcrumb" className="eyebrow mb-10"><Link href="/case-studies" className="hover:text-[var(--brand-accent)]">Case studies</Link></nav>
        {c.clientName && <p className="eyebrow">{c.clientName}</p>}
        <h1 className="display-xl mt-5">{c.title}</h1>
        {c.summary && <p className="lede mt-8 max-w-2xl">{c.summary}</p>}
      </header>
      {c.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="site-container"><div className="img-frame aspect-[21/9]"><img src={c.coverUrl} alt="" className="absolute inset-0 size-full object-cover" /></div></div>
      )}
      <div className="site-container mt-20 max-w-5xl space-y-20">
        {sections.filter(([, d]) => hasRichContent(d)).map(([title, doc]) => (
          <section key={title} className="grid gap-8 md:grid-cols-12">
            <h2 className="eyebrow md:col-span-3">{title}</h2>
            <div className="md:col-span-9"><RichText doc={doc} /></div>
          </section>
        ))}
      </div>
      <div className="site-container mt-24 max-w-5xl border-t border-[var(--line)] pt-12">
        <p className="display-sm">Ready to write your own story?</p>
        <Link href="/book" className="btn btn-primary mt-6">Book a consultation</Link>
      </div>
    </article>
  );
}
