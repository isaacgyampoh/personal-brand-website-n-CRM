import "server-only";
import { db } from "@/lib/database/pool";
import { loadSettings } from "@/features/settings/application/settings";
import { integrationStatuses } from "@/lib/integrations/store";

export type OnboardingStep = { key: string; title: string; why: string; href: string; done: boolean; optional?: boolean };

/**
 * Client onboarding checklist. Every "done" flag is derived from real data —
 * nothing is ticked by clicking — so the list always reflects what is
 * actually ready for launch.
 */
export async function onboardingSteps(userId: string): Promise<OnboardingStep[]> {
  const [s, st, counts, me] = await Promise.all([
    loadSettings(),
    integrationStatuses(),
    db.one<{ services: number; published_pages: number; events: number; testimonials: number; staff_mfa_missing: number; demo: number }>(
      `select (select count(*) from services where is_active)::int as services,
              (select count(*) from pages where status = 'published')::int as published_pages,
              (select count(*) from events where status = 'published')::int as events,
              (select count(*) from testimonials where status = 'approved')::int as testimonials,
              (select count(*) from users where role <> 'customer' and status = 'active' and mfa_enabled_at is null)::int as staff_mfa_missing,
              (select count(*) from services where slug like 'demo-%')::int + (select count(*) from events where slug like 'demo-%')::int as demo`),
    db.one<{ mfa: boolean }>("select mfa_enabled_at is not null as mfa from users where id = $1", [userId]),
  ]);
  const c = counts!;
  const brandDone = s.brand.name !== "Your Brand" && Boolean(s.brand.shortBio) && Boolean(s.brand.professionalTitle);
  return [
    { key: "mfa", title: "Protect your account with two-factor authentication", why: "Your Studio controls payments and client data.", href: "/admin/security", done: Boolean(me?.mfa) && c.staff_mfa_missing === 0 },
    { key: "brand", title: "Add your name, title and short bio", why: "Used across the website, emails and receipts.", href: "/admin/settings", done: brandDone },
    { key: "contact", title: "Add business contact details and legal name", why: "Shown on receipts, invoices and the contact page.", href: "/admin/settings", done: Boolean(s.contact.email) && Boolean(s.business.legalName) },
    { key: "smtp", title: "Connect email (SMTP)", why: "Booking confirmations, receipts and password resets.", href: "/admin/settings/integrations#smtp", done: st.smtp === "connected" },
    { key: "r2", title: "Connect file storage (Cloudflare R2)", why: "Photos, flyers, course videos and downloads.", href: "/admin/settings/integrations#r2", done: st.r2 === "connected" },
    { key: "paystack", title: "Connect Paystack (test mode first)", why: "Take Mobile Money and card payments.", href: "/admin/settings/integrations#paystack", done: st.paystack === "connected" },
    { key: "service", title: "Create your first coaching service", why: "Clients can book and pay online.", href: "/admin/services/new", done: c.services > 0 },
    { key: "homepage", title: "Review and publish your homepage", why: "Replace placeholder text with your story.", href: "/admin/website", done: c.published_pages > 0 },
    { key: "masterclass", title: "Publish a masterclass", why: "Flyer, date, price and link in a few minutes.", href: "/admin/events/quick", done: c.events > 0, optional: true },
    { key: "testimonial", title: "Approve a real testimonial", why: "Ask past clients — only genuine words are published.", href: "/admin/proof", done: c.testimonials > 0, optional: true },
    { key: "google", title: "Connect Google Calendar", why: "Avoid double-booking with your personal diary.", href: "/admin/settings/integrations#google", done: st.google === "connected", optional: true },
    { key: "demo", title: "Remove demonstration content", why: "Demo services and masterclasses must not be live at launch.", href: "/admin/system", done: c.demo === 0 },
  ];
}
