import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/cache";
import { PageHeader } from "@/components/website/page-header";
import { EnquiryForm } from "@/components/website/enquiry-form";
import { SocialLinks } from "@/components/website/social-links";
import { EmailLink, EmailText } from "@/components/shared/email-text";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

const TYPES = [
  { key: "contact", label: "General enquiry" },
  { key: "partnership", label: "Brand partnership" },
  { key: "corporate_training", label: "Corporate training" },
  { key: "media", label: "Media & press" },
] as const;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string; service?: string }> }) {
  const [s, sp] = await Promise.all([getPublicSettings(), searchParams]);
  const type = TYPES.find((t) => t.key === sp.type)?.key ?? "contact";
  return (
    <>
      <PageHeader eyebrow="Contact" title="Let's *talk*" intro="Tell me a little about what you're working on. Every message is read personally." />
      <div className="site-container grid gap-16 pb-28 lg:grid-cols-12">
        <aside className="space-y-10 lg:col-span-4">
          <nav aria-label="Enquiry type" className="flex flex-col">
            {TYPES.map((t) => (
              <Link key={t.key} href={`/contact?type=${t.key}`} aria-current={type === t.key ? "true" : undefined}
                className={`flex min-h-12 items-center justify-between border-b border-[var(--line)] py-3 ${type === t.key ? "font-semibold text-[var(--brand-accent)]" : ""}`}>
                {t.label}<span aria-hidden>→</span>
              </Link>
            ))}
            <Link href="/speaking#enquire" className="flex min-h-12 items-center justify-between border-b border-[var(--line)] py-3">Speaking invitation<span aria-hidden>→</span></Link>
          </nav>
          {(s.contact.email || s.contact.phone || s.contact.address) && (
            <dl className="space-y-4 text-sm">
              {s.contact.email && <div><dt className="eyebrow">Email</dt><dd className="mt-1"><EmailLink email={s.contact.email} className="underline-offset-4 hover:underline" /></dd></div>}
              {s.contact.phone && <div><dt className="eyebrow">Phone</dt><dd className="mt-1"><a href={`tel:${s.contact.phone.replace(/\s/g, "")}`}>{s.contact.phone}</a></dd></div>}
              {s.contact.address && <div><dt className="eyebrow">Studio</dt><dd className="mt-1">{[s.contact.address, s.contact.city, s.contact.country].filter(Boolean).join(", ")}</dd></div>}
            </dl>
          )}
          <SocialLinks social={s.social} />
        </aside>
        <div className="lg:col-span-7 lg:col-start-6">
          <EnquiryForm key={type} form={type} showOrg={type !== "contact"} showEventFields={type === "corporate_training"} defaultSubject={sp.service ? `Enquiry about ${sp.service.replace(/-/g, " ")}` : ""} />
        </div>
      </div>
    </>
  );
}
