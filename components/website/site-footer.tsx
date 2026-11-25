import Link from "next/link";
import type { Settings } from "@/features/settings/domain/schemas";
import { NewsletterForm } from "./newsletter-form";
import { SocialLinks } from "./social-links";
import { Emphasis } from "./emphasis";

export function SiteFooter({ settings: s }: { settings: Settings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="tone-ink">
      <div className="site-container pb-10 pt-20 md:pt-28">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow eyebrow-rule">{s.navigation.newsletterEyebrow}</p>
            <h2 className="display-md mt-5 max-w-md"><Emphasis text={s.navigation.newsletterHeading} /></h2>
            <div className="mt-8 max-w-md">
              <NewsletterForm source="footer" compact />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7">
            {s.navigation.footerColumns.map((col) => (
              <div key={col.title}>
                <p className="eyebrow">{col.title}</p>
                <ul className="mt-5 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className="inline-block py-0.5 text-[0.95rem] opacity-85 transition-opacity hover:opacity-100">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-8 border-t border-[var(--line)] pt-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-display text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.03em]">{s.brand.name}</p>
            {s.brand.professionalTitle && <p className="mt-3 text-sm opacity-70">{s.brand.professionalTitle}</p>}
          </div>
          <div className="flex flex-col gap-5 md:items-end">
            <SocialLinks social={s.social} />
            {s.contact.email && (
              <a href={`mailto:${s.contact.email}`} className="text-sm opacity-80 hover:opacity-100">{s.contact.email}</a>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 text-xs opacity-60 md:flex-row md:items-center md:justify-between">
          <p>© {year} {s.business.legalName || s.brand.name}. All rights reserved.{s.navigation.footerNote ? ` ${s.navigation.footerNote}` : ""}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li><Link href="/privacy-policy" className="hover:opacity-100">Privacy</Link></li>
            <li><Link href="/terms-of-service" className="hover:opacity-100">Terms</Link></li>
            <li><Link href="/refund-policy" className="hover:opacity-100">Refunds</Link></li>
            <li><Link href="/cancellation-policy" className="hover:opacity-100">Cancellations</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
