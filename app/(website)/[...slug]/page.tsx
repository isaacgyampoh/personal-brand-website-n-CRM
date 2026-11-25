import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { db } from "@/lib/database/pool";
import { getPublishedPage } from "@/features/website/application/public-queries";
import { RenderBlocks } from "@/components/website/blocks";
import { PageHeader } from "@/components/website/page-header";
import type { PageData, PageSeo } from "@/features/website-builder/domain/blocks";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  const page = await getPublishedPage(slug);
  if (!page) return {};
  const seo = (page.seo ?? {}) as Partial<PageSeo>;
  return {
    title: seo.title || page.title,
    description: seo.description || undefined,
    alternates: { canonical: seo.canonical || `/${slug}` },
    openGraph: { images: seo.ogImageUrl || undefined },
    robots: seo.noindex ? { index: false } : undefined,
  };
}

export default async function CmsPage({ params }: Props) {
  const slug = (await params).slug.join("/").toLowerCase();
  if (slug === "home") permanentRedirect("/");
  const page = await getPublishedPage(slug);
  if (!page) {
    const r = await db.one<{ to_path: string; status_code: number }>("select to_path, status_code from redirects where from_path = $1", [`/${slug}`]);
    if (r) (r.status_code === 301 || r.status_code === 308 ? permanentRedirect : redirect)(r.to_path);
    notFound();
  }
  const content = page.published_content as PageData;
  const startsWithHero = content.content[0]?.type === "Hero";
  return (
    <>
      {!startsWithHero && <PageHeader eyebrow={page.kind === "legal" ? "Legal" : undefined} title={page.title} />}
      {page.kind === "legal" && page.requires_legal_review && (
        <div className="site-container">
          <p className="mb-8 max-w-3xl border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This policy has not yet been confirmed by a legal professional.
          </p>
        </div>
      )}
      <RenderBlocks blocks={content.content} />
    </>
  );
}
