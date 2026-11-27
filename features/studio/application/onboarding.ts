import "server-only";
import { db } from "@/lib/database/pool";
import { loadSettings } from "@/features/settings/application/settings";
import { integrationStatuses } from "@/lib/integrations/store";

export type OnboardingStep = {
  key: string; title: string; why: string; how: string[]; href: string; action: string; done: boolean; optional?: boolean;
  /** What is still needed, in plain words. Empty when done. */
  missing: string[];
};

const need = (pairs: [string, unknown][]) => pairs.filter(([, v]) => !v).map(([k]) => k);

/**
 * Client launch checklist (Studio → Get started). Every "done" flag is derived
 * from real data — anything already imported is recognised automatically and
 * never asked for again.
 */
export async function onboardingSteps(userId: string): Promise<OnboardingStep[]> {
  const [s, st, c, me, legal] = await Promise.all([
    loadSettings(),
    integrationStatuses(),
    db.one<{ services: number; priced: number; bookable: number; hours: number; events: number; photos: number; staff_mfa_missing: number; demo: number; home: boolean }>(
      `select (select count(*) from services where is_active)::int as services,
              (select count(*) from services where is_active and (price_minor > 0 or price_display not in ('', 'Price on enquiry')))::int as priced,
              (select count(*) from services where is_active and booking_mode = 'instant')::int as bookable,
              (select count(*) from availability_rules)::int as hours,
              (select count(*) from events where status = 'published' and slug not like 'demo-%')::int as events,
              (select count(*) from media_assets where deleted_at is null and mime_type like 'image/%' and visibility = 'public' and category not in ('partners'))::int as photos,
              (select count(*) from users where role <> 'customer' and status = 'active' and mfa_enabled_at is null)::int as staff_mfa_missing,
              (select count(*) from services where is_demo)::int + (select count(*) from events where is_demo)::int + (select count(*) from articles where is_demo)::int + (select count(*) from pages where is_demo)::int as demo,
              exists (select 1 from pages where slug = 'home' and status = 'published') as home`),
    db.one<{ mfa: boolean }>("select mfa_enabled_at is not null as mfa from users where id = $1", [userId]),
    db.query<{ title: string; status: string }>("select title, status from pages where kind = 'legal' order by title"),
  ]);
  const n = c!;
  const appUrl = process.env.APP_URL ?? "";
  const profileMissing = need([["full name", s.profile.fullName], ["professional title", s.brand.professionalTitle], ["registered business name", s.business.legalName], ["business email", s.contact.email], ["phone number", s.contact.phone]]);
  const brandMissing = need([["logo (optional — your name is used as a wordmark until then)", s.brand.logoUrl], ["profile photograph", s.brand.portraitUrl], ["social sharing image", s.seo.ogImageUrl]]);
  if (n.photos < 3) brandMissing.push(`${3 - n.photos} more photograph(s)`);
  const bioMissing = need([["short biography", s.brand.shortBio], ["full biography", s.profile.longBio], ["areas of expertise", s.profile.expertise]]);
  const socialMissing = need([["business email", s.contact.email], ["LinkedIn profile link", s.social.linkedin]]);
  const unpublishedLegal = legal.filter((l) => l.status !== "published").map((l) => l.title);
  const brandStepDone = Boolean(s.brand.portraitUrl) && Boolean(s.seo.ogImageUrl) && n.photos >= 3;
  return [
    {
      key: "security", title: "Protect your account", action: "Open Security", href: "/admin/security",
      why: "Your Studio holds client details and payment settings.",
      how: ["Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password).", "Turn on two-factor sign-in and keep the 10 recovery codes somewhere safe."],
      done: Boolean(me?.mfa) && n.staff_mfa_missing === 0, missing: me?.mfa ? [] : ["two-factor sign-in"],
    },
    {
      key: "profile", title: "1. Complete your business profile", action: "Open Business profile", href: "/admin/settings/profile",
      why: "Your details appear on the website, receipts, invoices and emails.",
      how: ["Check the information we've already filled in from your materials.", "Add anything listed as missing below and press Save."],
      done: profileMissing.length === 0, missing: profileMissing,
    },
    {
      key: "branding", title: "2. Branding and photographs", action: "Open Business profile", href: "/admin/settings/profile",
      why: "Real photographs and a consistent look build trust.",
      how: ["Your headshot and event photos are already in Media. Add a logo if you have one.", "Adjust your brand colour and fonts under Brand identity if you wish."],
      done: brandStepDone, missing: brandMissing.filter((m) => !(brandStepDone && m.startsWith("logo"))),
    },
    {
      key: "bio", title: "3. Biography", action: "Open Business profile", href: "/admin/settings/profile",
      why: "Your story appears on the About page and in search results.",
      how: ["Read the biography imported from your document and adjust the wording to your voice.", "Add qualifications or a vision statement if you'd like them shown."],
      done: bioMissing.length === 0, missing: bioMissing,
    },
    {
      key: "contact", title: "4. Contact details and social media", action: "Open Business profile", href: "/admin/settings/profile",
      why: "Visitors need a way to reach you and follow your work.",
      how: ["Add your business email and phone number.", "Paste the full links to your LinkedIn, Instagram, Facebook and TikTok profiles (we have your follower numbers, but not the links)."],
      done: socialMissing.length === 0, missing: socialMissing,
    },
    {
      key: "services", title: "5. Coaching services and prices", action: "Open Services", href: "/admin/services",
      why: "Clients can see what you offer and book or enquire.",
      how: ["Four services were created from your materials and show \"Price on enquiry\".", "Confirm each price (or keep enquiry-only) and adjust the descriptions."],
      done: n.services > 0 && n.priced > 0, missing: n.services === 0 ? ["at least one service"] : n.priced === 0 ? ["confirmed prices (services currently show “Price on enquiry”)"] : [],
    },
    {
      key: "availability", title: "6. Appointment availability", action: "Open Availability", href: "/admin/bookings/availability",
      why: "Clients can only book the hours you make available.",
      how: ["Set your weekly hours and any days off.", "For each service you want booked directly, change \"Booking\" from Enquiry to Instant booking."],
      done: n.hours > 0 && n.bookable > 0, missing: n.bookable === 0 ? ["a service set to instant booking (all are enquiry-only now)"] : [],
    },
    {
      key: "masterclass", title: "7. Create a masterclass", action: "Create a masterclass", href: "/admin/events/quick",
      why: "Flyer, date, price and a shareable link in a few minutes.",
      how: ["Fill in the six short steps, preview, then publish.", "Copy the link and share it on LinkedIn or WhatsApp."],
      done: n.events > 0, missing: n.events > 0 ? [] : ["your first masterclass"], optional: true,
    },
    {
      key: "paystack", title: "8. Payments (Paystack)", action: "Open Integrations", href: "/admin/settings/integrations#paystack",
      why: "Take Mobile Money and card payments. Start in test mode — no real money moves.",
      how: [
        "Sign in at dashboard.paystack.com → Settings → API Keys & Webhooks.",
        "Copy your Test public and secret keys into the Paystack card and press Save.",
        `In Paystack, paste the Webhook URL (${appUrl}/api/webhooks/paystack) and the Callback URL shown on the card.`,
        "Press Test connection, then Enable. We switch to live payments together after a test purchase.",
      ],
      done: st.paystack === "connected", missing: st.paystack === "connected" ? [] : ["Paystack test keys"],
    },
    {
      key: "email", title: "9. Email", action: "Open Integrations", href: "/admin/settings/integrations#smtp",
      why: "Booking confirmations, receipts and reminders are sent from your own address.",
      how: ["Get the SMTP details (server, port, username, app password) from your email provider.", "Enter them in the Email card, press Test connection, then send a test email to yourself."],
      done: st.smtp === "connected", missing: st.smtp === "connected" ? [] : ["SMTP email details"],
    },
    {
      key: "legal", title: "10. Review legal policies", action: "Open Business profile", href: "/admin/settings/profile",
      why: "Required before taking payments and personal data at scale.",
      how: ["Paste your reviewed Privacy Policy, Terms, Refund and Cancellation policies and publish them.", "Until then, visitors see \"this policy is being finalised\"."],
      done: unpublishedLegal.length === 0, missing: unpublishedLegal,
    },
    {
      key: "preview", title: "11. Preview your website", action: "View website", href: "/",
      why: "Check every page on your phone and computer.",
      how: ["Open the website and read each page.", "Change anything in Website (pages) or Business profile (details)."],
      done: n.home && n.demo === 0, missing: n.home ? (n.demo ? ["remove demonstration content"] : []) : ["publish the home page"],
    },
    {
      key: "publish", title: "12. Publish your website", action: "Open SEO settings", href: "/admin/website/design",
      why: "Lets search engines find you once your domain is connected.",
      how: ["After your domain is connected, turn on \"Allow search engines\" in Website → Design → Search & social."],
      done: s.seo.indexable, missing: s.seo.indexable ? [] : ["search engine visibility (turned on at launch)"],
    },
  ];
}
