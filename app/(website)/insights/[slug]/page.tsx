import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArticle } from "@/features/website/application/public-queries";
import { getPublicSettings } from "@/lib/cache";
import { RichText } from "@/components/shared/rich-text";
import { ArticleCard } from "@/components/website/cards";
import { NewsletterForm } from "@/components/website/newsletter-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getPublicArticle((await params).slug);
  if (!r) return {};
  const a = r.article;
  return {
    title: a.seo.title || a.title,
    description: a.seo.description || a.excerpt,
    alternates: { canonical: `/insights/${a.slug}` },
    openGraph: { type: "article", publishedTime: a.publishedAt, images: a.coverUrl ? [a.coverUrl] : undefined, title: a.title, description: a.excerpt },
  };
}

function embed(url: string) {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  return vm ? `https://player.vimeo.com/video/${vm[1]}?dnt=1` : null;
}

export default async function ArticlePage({ params }: Props) {
  const [r, s] = await Promise.all([getPublicArticle((await params).slug), getPublicSettings()]);
  if (!r) notFound();
  const { article: a, related } = r;
  const date = new Date(a.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const video = a.videoUrl ? embed(a.videoUrl) : null;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.excerpt, datePublished: a.publishedAt,
    author: { "@type": "Person", name: a.authorName || s.brand.name }, image: a.coverUrl ? [a.coverUrl] : undefined,
    mainEntityOfPage: `${process.env.APP_URL}/insights/${a.slug}`,
  };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="site-container max-w-4xl pb-12 pt-10 text-center md:pt-16">
        <p className="eyebrow">
          {a.categorySlug ? <Link href={`/insights?category=${a.categorySlug}`} className="hover:text-[var(--brand-accent)]">{a.categoryName}</Link> : "Insight"} · {a.readingMinutes} min read
        </p>
        <h1 className="display-xl mt-6">{a.title}</h1>
        {a.excerpt && <p className="lede mx-auto mt-8 max-w-2xl">{a.excerpt}</p>}
        <p className="mt-8 text-sm text-[var(--muted-ink)]">{a.authorName || s.brand.name} · <time dateTime={a.publishedAt}>{date}</time></p>
      </header>
      {a.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="site-container max-w-6xl"><div className="img-frame aspect-[16/9]"><img src={a.coverUrl} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" /></div></div>
      )}
      <div className="site-container max-w-[46rem] py-16 md:py-24">
        {video && <div className="img-frame mb-12 aspect-video"><iframe src={video} title={a.title} className="absolute inset-0 size-full" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" /></div>}
        <RichText doc={a.body} className="prose-site [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:mr-3 [&>p:first-child]:first-letter:font-display [&>p:first-child]:first-letter:text-[4.4rem] [&>p:first-child]:first-letter:leading-[0.8]" />
        {a.tags.length > 0 && (
          <ul className="mt-14 flex flex-wrap gap-2" aria-label="Tags">{a.tags.map((t) => <li key={t} className="border border-[var(--line)] px-3 py-1 text-xs">{t}</li>)}</ul>
        )}
      </div>
      <section className="tone-surface section-y-sm">
        <div className="site-container grid gap-10 md:grid-cols-2 md:items-end">
          <div><p className="eyebrow eyebrow-rule">{s.navigation.newsletterEyebrow}</p><p className="display-md mt-5">Get the next one in your inbox.</p></div>
          <NewsletterForm source={`article:${a.slug}`} compact />
        </div>
      </section>
      {related.length > 0 && (
        <section className="site-container section-y" aria-labelledby="related">
          <h2 id="related" className="eyebrow mb-12">Keep reading</h2>
          <div className="grid gap-12 md:grid-cols-3">{related.map((x) => <ArticleCard key={x.id} a={x} />)}</div>
        </section>
      )}
    </article>
  );
}
