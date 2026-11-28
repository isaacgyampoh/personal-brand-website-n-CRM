import { themeCss as themeCssFor } from "@/lib/theme";
import "../site.css";
import type { Metadata } from "next";
import { getPublicSettings } from "@/lib/cache";
import { SiteHeader } from "@/components/website/site-header";
import { SiteFooter } from "@/components/website/site-footer";
import { AnnouncementBar } from "@/components/website/announcement-bar";
import { SiteEffects } from "@/components/website/site-effects";
import { PopupHost } from "@/components/website/popup-host";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings();
  const index = s.seo.indexable && process.env.NODE_ENV === "production";
  return {
    title: { default: s.seo.defaultTitle || s.brand.name, template: s.seo.titleTemplate.includes("%s") ? s.seo.titleTemplate : `%s | ${s.brand.name}` },
    description: s.seo.defaultDescription || s.brand.tagline || undefined,
    openGraph: { siteName: s.brand.name, type: "website", images: s.seo.ogImageUrl ? [s.seo.ogImageUrl] : undefined },
    twitter: { card: "summary_large_image", site: s.seo.xHandle || undefined },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    ...(s.brand.faviconUrl ? { icons: { icon: s.brand.faviconUrl, apple: s.brand.faviconUrl } } : {}),
  };
}

export default async function WebsiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  // Values are validated hex colours / known font variables (see settings schema).
  const themeCss = themeCssFor(s.theme, ":root");
  const now = Date.now();
  const a = s.announcement;
  const showAnnouncement = a.enabled && a.text && (!a.startsAt || Date.parse(a.startsAt) <= now) && (!a.endsAt || Date.parse(a.endsAt) > now);

  return (
    <div className="site flex min-h-dvh flex-col">
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <a href="#main" className="skip-link">Skip to content</a>
      {showAnnouncement && <AnnouncementBar text={a.text} href={a.href} />}
      <SiteHeader
        brandName={s.brand.name}
        logoUrl={s.brand.logoUrl}
        logoText={s.brand.logoText}
        links={s.navigation.header}
        cta={s.navigation.cta}
      />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter settings={s} />
      <SiteEffects />
      <PopupHost />
      {process.env.DEMO_BANNER === "true" && <div className="demo-flag" role="note">Demonstration content</div>}
    </div>
  );
}

// Rendered per request; published content comes from the tagged data cache (lib/cache.ts).
export const dynamic = "force-dynamic";
