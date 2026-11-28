import { themeCss as themeCssFor } from "@/lib/theme";
import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { pageById } from "@/features/website/application/pages";
import { loadSettings } from "@/features/settings/application/settings";
import { FONT_PAIRS, fontVariables } from "@/lib/fonts";
import { toLocalInput } from "@/lib/time";
import { PageStudio } from "@/components/editor/page-studio";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { title: "Website Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("website:edit", "/admin/website");
  const { id } = await params;
  const page = await pageById(id);
  if (!page) notFound();
  const s = await loadSettings();
  const themeCss = themeCssFor(s.theme, ".site");
  return (
    <>
      <PageStudio
        page={{ id: page.id, title: page.title, slug: page.slug, kind: page.kind, status: page.status, draft: page.draft_content, seo: page.seo, scheduledFor: page.scheduled_publish_at ? toLocalInput(page.scheduled_publish_at, s.business.timezone) : "", requiresLegalReview: page.requires_legal_review }}
        canPublish={user.permissions.has("website:publish")}
        rootClassName={fontVariables}
        themeCss={themeCss}
        timezone={s.business.timezone}
      />
      <Toaster position="bottom-right" richColors />
    </>
  );
}
