import "../site.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/cache";
import { FONT_PAIRS } from "@/lib/fonts";
import { getPublicEvents } from "@/features/website/application/public-queries";
import { SocialLinks } from "@/components/website/social-links";

export const metadata: Metadata = { title: "Links" };

/** Mobile-first link-in-bio page (replaces a Linktree subscription). */
export default async function LinksPage() {
  const [s, events] = await Promise.all([getPublicSettings(), getPublicEvents()]);
  const pair = FONT_PAIRS[s.theme.fontPair];
  const next = events.find((e) => e.status === "published" && Date.parse(e.startsAt) > Date.now());
  const items = s.links.items.length ? s.links.items : [
    { label: "Book a session", href: "/book", highlight: true },
    { label: "Masterclasses", href: "/masterclasses", highlight: false },
    { label: "Insights", href: "/insights", highlight: false },
    { label: "Website", href: "/", highlight: false },
  ];
  const css = `:root{--ink:${s.theme.ink};--paper:${s.theme.paper};--surface:${s.theme.surface};--brand-accent:${s.theme.accent};--brand-accent-ink:${s.theme.accentInk};--muted-ink:${s.theme.muted};--site-display:${pair.display};--site-body:${pair.body}}`;
  return (
    <div className="site min-h-dvh">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-14">
        <div className="text-center">
          {s.brand.portraitUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.brand.portraitUrl} alt={s.brand.portraitAlt || s.brand.name} className="mx-auto size-24 rounded-full object-cover" />
          )}
          <h1 className="mt-6 font-display text-4xl">{s.brand.name}</h1>
          {(s.links.headline || s.brand.professionalTitle) && <p className="mt-2 text-sm text-[var(--muted-ink)]">{s.links.headline || s.brand.professionalTitle}</p>}
        </div>
        <ul className="mt-10 space-y-3">
          {next && (
            <li><Link href={`/masterclasses/${next.slug}`} className="block border border-[var(--brand-accent)] bg-[var(--brand-accent)] px-5 py-4 text-center text-[var(--brand-accent-ink)]"><span className="eyebrow block !text-[inherit] opacity-80">Next masterclass</span><span className="mt-1 block font-semibold">{next.title}</span></Link></li>
          )}
          {s.contact.whatsapp && (
            <li><a href={`https://wa.me/${s.contact.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-center border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-center font-semibold hover:border-[var(--ink)]">Chat on WhatsApp</a></li>
          )}
          {items.map((l, i) => (
            <li key={i}>
              <Link href={l.href} className={`flex min-h-14 items-center justify-center border px-5 py-4 text-center font-semibold transition-colors ${l.highlight ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--ink)]"}`}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex justify-center pt-12"><SocialLinks social={s.social} className="justify-center" /></div>
      </main>
    </div>
  );
}

// Rendered per request; published content comes from the tagged data cache (lib/cache.ts).
export const dynamic = "force-dynamic";
