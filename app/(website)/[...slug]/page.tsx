import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { db } from "@/lib/database/pool";
import { getPublishedPage } from "@/features/website/application/public-queries";
import { RenderBlocks } from "@/components/website/blocks";
import { PageHeader } from "@/components/website/page-header";
import { EmailLink } from "@/components/shared/email-text";
import type { PageData, PageSeo } from "@/features/website-builder/domain/blocks";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  const page = await getPublishedPage(slug);
  if (!page) return { robots: { index: false, follow: false } };
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
    // Legal pages stay unpublished until the client's reviewed text is entered. Never show
    // invented legal text, but don't break the links that point here either.
    const legal = await db.one<{ title: string }>("select title from pages where slug = $1 and kind = 'legal' and status <> 'archived'", [slug]);
    if (legal) {
      const contact = await db.one<{ email: string | null }>("select value->>'email' as email from settings where key = 'contact'");
      return (
        <>
          <PageHeader eyebrow="Legal" title={legal.title} />
          <div className="site-container max-w-3xl pb-28">
            <p className="lede">This policy is being finalised and will be published here shortly.</p>
            <p className="mt-6 text-[var(--muted-ink)]">{contact?.email ? <>For any question about how your information is handled, please contact us at <EmailLink email={contact.email} className="underline" />.</> : "For any question about how your information is handled, please use the contact page."}</p>
          </div>
        </>
      );
    }
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
