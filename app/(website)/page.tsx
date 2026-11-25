import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/cache";
import { getPublishedPage } from "@/features/website/application/public-queries";
import { RenderBlocks } from "@/components/website/blocks";
import type { PageData, PageSeo } from "@/features/website-builder/domain/blocks";

export async function generateMetadata(): Promise<Metadata> {
  const [page, s] = await Promise.all([getPublishedPage("home"), getPublicSettings()]);
  const seo = (page?.seo ?? {}) as Partial<PageSeo>;
  return {
    title: { absolute: seo.title || s.seo.defaultTitle || s.brand.name },
    description: seo.description || s.seo.defaultDescription || s.brand.tagline || undefined,
    alternates: { canonical: "/" },
    openGraph: { images: seo.ogImageUrl || s.seo.ogImageUrl || undefined },
  };
}

export default async function HomePage() {
  const [page, s] = await Promise.all([getPublishedPage("home"), getPublicSettings()]);
  const content = page?.published_content as PageData | null;
  if (!content?.content.length) {
    // Nothing has been published yet: show a dignified holding page, never placeholder claims.
    return (
      <section className="site-container flex min-h-[70svh] flex-col justify-center py-24">
        <p className="eyebrow eyebrow-rule">{s.brand.professionalTitle || "Welcome"}</p>
        <h1 className="display-xl mt-8 max-w-4xl">{s.brand.name}</h1>
        {s.brand.tagline && <p className="lede mt-8 max-w-xl">{s.brand.tagline}</p>}
        <div className="mt-12 flex flex-wrap gap-6">
          <Link href="/book" className="btn btn-primary">Book a session</Link>
          <Link href="/contact" className="btn btn-link">Get in touch</Link>
        </div>
      </section>
    );
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: s.brand.name,
    jobTitle: s.brand.professionalTitle || undefined,
    description: s.brand.shortBio || s.brand.tagline || undefined,
    url: process.env.APP_URL,
    image: s.brand.portraitUrl || undefined,
    sameAs: Object.values(s.social).filter(Boolean),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <RenderBlocks blocks={content.content} />
    </>
  );
}
