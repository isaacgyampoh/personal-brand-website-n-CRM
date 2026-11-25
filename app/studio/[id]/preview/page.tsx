import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { pageById } from "@/features/website/application/pages";
import { getPublicSettings } from "@/lib/cache";
import { FONT_PAIRS } from "@/lib/fonts";
import { pageDataSchema, type PageData } from "@/features/website-builder/domain/blocks";
import { RenderBlocks } from "@/components/website/blocks";
import { SiteHeader } from "@/components/website/site-header";
import { SiteFooter } from "@/components/website/site-footer";

export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff-only preview of the DRAFT. Drafts are never served on public routes. */
export default async function DraftPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("website:edit", "/admin/website");
  const page = await pageById((await params).id);
  if (!page) notFound();
  const s = await getPublicSettings();
  const parsed = pageDataSchema.safeParse(page.draft_content);
  const pair = FONT_PAIRS[s.theme.fontPair];
  const css = `:root{--ink:${s.theme.ink};--paper:${s.theme.paper};--surface:${s.theme.surface};--brand-accent:${s.theme.accent};--brand-accent-ink:${s.theme.accentInk};--muted-ink:${s.theme.muted};--site-display:${pair.display};--site-body:${pair.body};--display-scale:${pair.displayScale}}`;
  return (
    <div className="site min-h-dvh">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-xs font-semibold uppercase tracking-widest text-black">Draft preview — not published</div>
      <SiteHeader brandName={s.brand.name} logoUrl={s.brand.logoUrl} logoText={s.brand.logoText} links={s.navigation.header} cta={s.navigation.cta} />
      {parsed.success ? <RenderBlocks blocks={(parsed.data as PageData).content} /> : <p className="site-container py-20">This draft has invalid content: {parsed.error.issues[0]?.message}</p>}
      <SiteFooter settings={s} />
    </div>
  );
}
