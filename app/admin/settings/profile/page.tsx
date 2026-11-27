import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { loadSettings } from "@/features/settings/application/settings";
import { db } from "@/lib/database/pool";
import { PageTitle, Panel, StatusBadge } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata = { title: "Business profile" };
export const dynamic = "force-dynamic";

const CURRENCIES: [string, string][] = [["GHS", "GHS — Ghana cedi"], ["USD", "USD — US dollar"], ["NGN", "NGN — Naira"], ["KES", "KES — Kenyan shilling"], ["ZAR", "ZAR — Rand"], ["GBP", "GBP — Pound"], ["EUR", "EUR — Euro"]];
const ZONES: [string, string][] = [["Africa/Accra", "Accra (GMT)"], ["Africa/Lagos", "Lagos (WAT)"], ["Africa/Nairobi", "Nairobi (EAT)"], ["Africa/Johannesburg", "Johannesburg (SAST)"], ["Europe/London", "London"], ["America/New_York", "New York"]];

function Done({ ok, missing }: { ok: boolean; missing: string[] }) {
  return ok ? <StatusBadge status="complete" tone="green" /> : <span className="text-xs text-amber-700">Missing: {missing.join(", ")}</span>;
}

/** One place for everything about the business. Saved to PostgreSQL; the website updates immediately. */
export default async function BusinessProfile() {
  await requireStaffPage("settings:manage", "/admin/settings/profile");
  const s = await loadSettings();
  const legal = await db.query<{ id: string; slug: string; title: string; status: string }>("select id, slug, title, status from pages where kind = 'legal' order by title");
  const miss = (pairs: [string, unknown][]) => pairs.filter(([, v]) => !v).map(([k]) => k);
  const personal = miss([["full name", s.profile.fullName], ["title", s.brand.professionalTitle], ["short bio", s.brand.shortBio], ["full biography", s.profile.longBio], ["expertise", s.profile.expertise]]);
  const identity = miss([["logo", s.brand.logoUrl], ["profile photo", s.brand.portraitUrl], ["sharing image", s.seo.ogImageUrl], ["tagline", s.brand.tagline]]);
  const contact = miss([["email", s.contact.email], ["phone", s.contact.phone], ["LinkedIn", s.social.linkedin]]);
  const business = miss([["legal name", s.business.legalName]]);
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Business profile" description="Everything the website, emails, receipts and certificates say about you. Save a section and the website updates — no developer needed." back={{ href: "/admin/settings", label: "Settings" }} />

      <Panel title="Personal & professional" actions={<Done ok={!personal.length} missing={personal} />}>
        <SettingsForm settingKey="brand" initial={s.brand} fields={[
          { name: "name", label: "Display name (shown as your brand name)", type: "text" },
          { name: "professionalTitle", label: "Professional title", type: "text", hint: "e.g. LinkedIn Visibility Coach · Trainer · Corporate Consultant" },
          { name: "tagline", label: "Brand tagline", type: "text" },
          { name: "shortBio", label: "Short biography (2–3 sentences — cards, search results, link-in-bio)", type: "textarea" },
        ]} />
        <div className="mt-6 border-t pt-6">
          <SettingsForm settingKey="profile" initial={s.profile} fields={[
            { name: "fullName", label: "Full legal / professional name", type: "text" },
            { name: "longBio", label: "Full biography (About page)", type: "textarea", rows: 8 },
            { name: "expertise", label: "Areas of expertise — one per line", type: "textarea", rows: 5 },
            { name: "qualifications", label: "Qualifications & certifications — one per line", type: "textarea", rows: 4, hint: "Only list what you hold. Leave empty to hide this section." },
            { name: "achievements", label: "Recognition & achievements — one per line", type: "textarea", rows: 5, hint: "Only verifiable facts. Empty sections are hidden on the website." },
            { name: "mission", label: "Mission", type: "textarea" },
            { name: "vision", label: "Vision", type: "textarea" },
          ]} />
        </div>
      </Panel>

      <Panel title="Brand identity" description="Logo, photographs and the image shown when your link is shared." actions={<Done ok={!identity.length} missing={identity} />}>
        <SettingsForm settingKey="brand" initial={s.brand} fields={[
          { name: "logoUrl", label: "Primary logo", type: "image", hint: "No logo yet? Your name is shown as an elegant wordmark." },
          { name: "altLogoUrl", label: "Alternative logo (light version for dark backgrounds)", type: "image" },
          { name: "faviconUrl", label: "Browser tab icon (square, at least 192×192)", type: "image" },
          { name: "portraitUrl", label: "Profile photograph", type: "image" },
          { name: "portraitAlt", label: "Describe the photo (for screen readers)", type: "text" },
        ]} />
        <div className="mt-6 border-t pt-6">
          <SettingsForm settingKey="seo" initial={s.seo} fields={[
            { name: "ogImageUrl", label: "Default social sharing image (1200×630 works best)", type: "image" },
          ]} />
        </div>
        <div className="mt-6 border-t pt-6">
          <p className="mb-3 text-sm font-medium">Colours & typography</p>
          <SettingsForm settingKey="theme" initial={s.theme} fields={[
            { name: "accent", label: "Brand colour", type: "color" }, { name: "accentInk", label: "Text on brand colour", type: "color" },
            { name: "ink", label: "Text", type: "color" }, { name: "paper", label: "Background", type: "color" },
            { name: "surface", label: "Cards", type: "color" }, { name: "muted", label: "Secondary text", type: "color" },
            { name: "fontPair", label: "Typography", type: "select", options: [["editorial", "Editorial — Cormorant Garamond + Manrope"], ["classic", "Classic — Playfair Display + Source Sans"], ["modern", "Modern — Instrument Serif + Inter"]] },
          ]} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Homepage photographs are chosen on each page in <Link className="underline" href="/admin/website">Website</Link>; upload and crop them in <Link className="underline" href="/admin/media">Media</Link>.</p>
      </Panel>

      <Panel title="Contact & social media" actions={<Done ok={!contact.length} missing={contact} />}>
        <SettingsForm settingKey="contact" initial={s.contact} fields={[
          { name: "email", label: "Business email", type: "email" }, { name: "phone", label: "Telephone / WhatsApp number", type: "text" },
          { name: "address", label: "Business address", type: "text" }, { name: "city", label: "City", type: "text" },
          { name: "country", label: "Country", type: "text" }, { name: "businessHours", label: "Business hours", type: "text", hint: "e.g. Mon–Fri, 9am–5pm GMT" },
        ]} />
        <div className="mt-6 border-t pt-6">
          <SettingsForm settingKey="social" initial={s.social} fields={[
            { name: "linkedin", label: "LinkedIn profile URL", type: "text" }, { name: "instagram", label: "Instagram URL", type: "text" },
            { name: "facebook", label: "Facebook URL", type: "text" }, { name: "tiktok", label: "TikTok URL", type: "text" },
            { name: "youtube", label: "YouTube URL", type: "text" }, { name: "x", label: "X (Twitter) URL", type: "text" },
            { name: "podcast", label: "Podcast URL", type: "text" }, { name: "other", label: "Other website", type: "text" },
          ]} />
          <p className="mt-2 text-xs text-muted-foreground">Paste full links starting with https://. Empty ones are simply not shown.</p>
        </div>
      </Panel>

      <Panel title="Business configuration" actions={<Done ok={!business.length} missing={business} />}>
        <SettingsForm settingKey="business" initial={s.business} fields={[
          { name: "legalName", label: "Registered business name", type: "text" },
          { name: "registrationNumber", label: "Business registration number (optional)", type: "text" },
          { name: "taxNumber", label: "Tax ID / TIN (shown on invoices, optional)", type: "text" },
          { name: "currency", label: "Currency", type: "select", options: CURRENCIES },
          { name: "timezone", label: "Time zone", type: "select", options: ZONES },
          { name: "receiptFooter", label: "Note printed on receipts & invoices", type: "textarea" },
          { name: "bookingPolicy", label: "Booking policy (shown on booking pages)", type: "textarea", rows: 4 },
        ]} />
        <div className="mt-6 border-t pt-6">
          <p className="mb-2 text-sm font-medium">Policies</p>
          <p className="mb-3 text-xs text-muted-foreground">Paste your reviewed text into each policy and publish it. Until then, visitors see &quot;this policy is being finalised&quot;. Online payments should not go live before your Terms, Privacy and Refund policies are published.</p>
          <ul className="divide-y rounded-lg border text-sm">
            {legal.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <span>{p.title}</span>
                <span className="flex items-center gap-3"><StatusBadge status={p.status} tone={p.status === "published" ? "green" : "amber"} /><Link className="underline" href={`/studio/${p.id}`}>Edit</Link></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Receipt and certificate branding: <Link className="underline" href="/admin/settings#documents">Settings → Receipts &amp; certificates</Link>.</p>
        </div>
      </Panel>
    </div>
  );
}
