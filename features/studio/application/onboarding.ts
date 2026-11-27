import "server-only";
import { db } from "@/lib/database/pool";
import { loadSettings } from "@/features/settings/application/settings";
import { integrationStatuses } from "@/lib/integrations/store";

export type OnboardingStep = {
  key: string; title: string; why: string; how: string[]; href: string; action: string; done: boolean; optional?: boolean;
};

/**
 * Client launch checklist (Studio → Get started). Written for a non-technical
 * owner. Every "done" flag is derived from real data — nothing is ticked by
 * clicking — so the list always shows what is actually ready.
 */
export async function onboardingSteps(userId: string): Promise<OnboardingStep[]> {
  const [s, st, c, me] = await Promise.all([
    loadSettings(),
    integrationStatuses(),
    db.one<{ services: number; real_services: number; published_pages: number; events: number; photos: number; staff_mfa_missing: number; demo: number }>(
      `select (select count(*) from services where is_active)::int as services,
              (select count(*) from services where is_active and slug not like 'demo-%' and price_minor >= 0)::int as real_services,
              (select count(*) from pages where status = 'published')::int as published_pages,
              (select count(*) from events where status = 'published' and slug not like 'demo-%')::int as events,
              (select count(*) from media_assets where deleted_at is null and mime_type like 'image/%' and visibility = 'public' and filename not ilike '%demo%')::int as photos,
              (select count(*) from users where role <> 'customer' and status = 'active' and mfa_enabled_at is null)::int as staff_mfa_missing,
              (select count(*) from services where slug like 'demo-%')::int + (select count(*) from events where slug like 'demo-%')::int
                + (select count(*) from articles where slug like 'demo-%')::int as demo`),
    db.one<{ mfa: boolean }>("select mfa_enabled_at is not null as mfa from users where id = $1", [userId]),
  ]);
  const n = c!;
  const appUrl = process.env.APP_URL ?? "";
  return [
    {
      key: "security", title: "Protect your account", action: "Open Security",
      why: "Your Studio holds client details and payment settings.", href: "/admin/security",
      how: ["Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password).", "Turn on two-factor sign-in and save the 10 recovery codes somewhere safe."],
      done: Boolean(me?.mfa) && n.staff_mfa_missing === 0,
    },
    {
      key: "business", title: "1. Business information", action: "Open Business settings",
      why: "Shown on receipts, invoices, emails and the contact page.", href: "/admin/settings",
      how: ["Enter your registered business name, contact email, phone and address.", "Check the currency (GHS) and time zone (Africa/Accra)."],
      done: Boolean(s.contact.email) && Boolean(s.business.legalName),
    },
    {
      key: "brand", title: "2. Brand identity", action: "Open Website design",
      why: "Your name, logo and colours appear across the website, receipts and certificates.", href: "/admin/website/design",
      how: ["Enter your brand name and professional title.", "Upload your logo and choose your brand colours and font style."],
      done: s.brand.name !== "Your Brand" && s.brand.name !== "Demo Studio" && Boolean(s.brand.professionalTitle),
    },
    {
      key: "photos", title: "3. Professional photographs", action: "Open Media",
      why: "Real photographs build trust far more than stock images.", href: "/admin/media",
      how: ["Upload at least three photos: a portrait, you speaking or coaching, and a lifestyle image.", "Add a short description (alt text) to each and set the focal point so crops keep your face in frame."],
      done: n.photos >= 3 && Boolean(s.brand.portraitUrl),
    },
    {
      key: "bio", title: "4. Biography", action: "Open Website design",
      why: "Used on the About page, speaker profile and link previews.", href: "/admin/website/design",
      how: ["Write a short bio (2–4 sentences) in your own words.", "Only include achievements and results you can stand behind — the site never invents them."],
      done: (s.brand.shortBio ?? "").length >= 80,
    },
    {
      key: "services", title: "5. Coaching services and prices", action: "Open Services",
      why: "Clients can book and pay for sessions online.", href: "/admin/services",
      how: ["Create each service with its price, length and what's included.", "Set your available hours, and choose how online sessions happen (Zoom, Google Meet or a link you paste)."],
      done: n.real_services > 0,
    },
    {
      key: "social", title: "6. Social media links", action: "Open Business settings",
      why: "Linked from the footer and your link-in-bio page.", href: "/admin/settings",
      how: ["Paste the full web address of each profile you use (LinkedIn, Instagram…)."],
      done: Object.values(s.social).some(Boolean),
    },
    {
      key: "paystack", title: "7. Paystack payments", action: "Open Integrations",
      why: "Take Mobile Money and card payments. Start in test mode — no real money moves.", href: "/admin/settings/integrations#paystack",
      how: [
        "Sign in at dashboard.paystack.com → Settings → API Keys & Webhooks.",
        "Copy your Test public key and Test secret key into the Paystack card and press Save.",
        `In Paystack, paste the Webhook URL (${appUrl}/api/webhooks/paystack) and Callback URL shown on the card.`,
        "Press Test connection, then Enable. Live payments are switched on later, together, after a test purchase.",
      ],
      done: st.paystack === "connected",
    },
    {
      key: "email", title: "8. Email", action: "Open Integrations",
      why: "Booking confirmations, receipts, reminders and password resets come from your own address.", href: "/admin/settings/integrations#smtp",
      how: [
        "From your email provider, get the SMTP server, port, username and password (often an \"app password\").",
        "Enter them in the Email card, press Test connection, then Send test email to yourself.",
        "Ask your domain provider to add the SPF/DKIM records your email provider gives you, so messages don't land in spam.",
      ],
      done: st.smtp === "connected",
    },
    {
      key: "google", title: "9. Google Calendar", action: "Open Integrations",
      why: "Your existing appointments block booking times, and new bookings appear in your calendar.", href: "/admin/settings/integrations#google",
      how: ["Follow the setup steps on the Google card (a one-time Google Cloud setup), then press Connect Google account.", "Choose the calendar to use and press Test connection."],
      done: st.google === "connected", optional: true,
    },
    {
      key: "meetings", title: "10. Zoom or Google Meet", action: "Open Integrations",
      why: "Meeting links are created automatically for online sessions and masterclasses.", href: "/admin/settings/integrations#zoom",
      how: ["Either connect Zoom (Zoom card) or use Google Meet through step 9.", "You can always paste a meeting link by hand instead — this step is optional."],
      done: st.zoom === "connected" || st.google === "connected", optional: true,
    },
    {
      key: "masterclass", title: "11. Create your first masterclass", action: "Create a masterclass",
      why: "Flyer, date, price and a shareable link in a few minutes.", href: "/admin/events/quick",
      how: ["Fill in the six short steps, press Save draft & preview, check the page, then Publish.", "Copy the link and share it on WhatsApp or LinkedIn."],
      done: n.events > 0,
    },
    {
      key: "publish", title: "12. Preview and publish your website", action: "Open Website",
      why: "Replace the demonstration text and photos with your own, then publish.", href: "/admin/website",
      how: ["Open each page, replace placeholder wording and images, and use Preview on phone and desktop.", "Paste your lawyer-reviewed Privacy Policy and Terms into those pages and publish them (until then visitors see a \"being finalised\" notice).", "Press Publish. Demonstration content must be removed before launch (we'll do this together)."],
      done: n.published_pages > 0 && n.demo === 0,
    },
  ];
}
