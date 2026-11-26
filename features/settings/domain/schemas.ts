import { z } from "zod";

const url = z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v) || v.startsWith("/"), {
  message: "Must be an https:// URL or a site path",
});
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a1a1a");
const link = z.object({ label: z.string().trim().min(1).max(60), href: url });

export const settingSchemas = {
  brand: z.object({
    name: z.string().trim().min(1).max(80).default("Your Brand"),
    professionalTitle: z.string().trim().max(120).default(""),
    tagline: z.string().trim().max(200).default(""),
    shortBio: z.string().trim().max(600).default(""),
    logoUrl: url.default(""),
    logoText: z.string().trim().max(40).default(""),
    portraitUrl: url.default(""),
    portraitAlt: z.string().trim().max(200).default(""),
  }),
  theme: z.object({
    ink: hex.default("#1b1916"),
    paper: hex.default("#f6f1ea"),
    surface: hex.default("#ffffff"),
    accent: hex.default("#8a5a3c"),
    accentInk: hex.default("#ffffff"),
    muted: hex.default("#6f675e"),
    fontPair: z.enum(["editorial", "classic", "modern"]).default("editorial"),
    corners: z.enum(["square", "soft"]).default("square"),
  }),
  contact: z.object({
    email: z.union([z.literal(""), z.string().email()]).default(""),
    phone: z.string().trim().max(32).default(""),
    address: z.string().trim().max(300).default(""),
    city: z.string().trim().max(80).default(""),
    country: z.string().trim().max(80).default("Ghana"),
    bookingNote: z.string().trim().max(300).default(""),
  }),
  social: z.object({
    linkedin: url.default(""),
    instagram: url.default(""),
    x: url.default(""),
    youtube: url.default(""),
    tiktok: url.default(""),
    facebook: url.default(""),
    podcast: url.default(""),
  }),
  business: z.object({
    timezone: z.string().default("Africa/Accra"),
    currency: z.string().length(3).default("GHS"),
    locale: z.string().default("en-GH"),
    legalName: z.string().trim().max(150).default(""),
    receiptFooter: z.string().trim().max(500).default(""),
  }),
  commerce: z.object({
    holdMinutes: z.number().int().min(5).max(120).default(20),
    allowDiscountCodes: z.boolean().default(true),
    /** Provider used for NEW checkouts. Existing payments always verify with the provider that created them. */
    paymentProvider: z.enum(["paystack", "hubtel"]).default("paystack"),
  }),
  seo: z.object({
    titleTemplate: z.string().max(80).default("%s | Your Brand"),
    defaultTitle: z.string().max(80).default("Your Brand"),
    defaultDescription: z.string().max(300).default(""),
    ogImageUrl: url.default(""),
    xHandle: z.string().max(30).default(""),
    indexable: z.boolean().default(false),
  }),
  navigation: z.object({
    header: z.array(link).max(8).default([
      { label: "About", href: "/about" },
      { label: "Services", href: "/services" },
      { label: "Masterclasses", href: "/masterclasses" },
      { label: "Academy", href: "/academy" },
      { label: "Insights", href: "/insights" },
      { label: "Speaking", href: "/speaking" },
    ]),
    cta: link.default({ label: "Book a session", href: "/book" }),
    footerColumns: z
      .array(z.object({ title: z.string().max(40), links: z.array(link).max(10) }))
      .max(4)
      .default([
        { title: "Work together", links: [
          { label: "Services", href: "/services" }, { label: "Book a session", href: "/book" },
          { label: "Speaking", href: "/speaking" }, { label: "Masterclasses", href: "/masterclasses" } ] },
        { title: "Learn", links: [
          { label: "Academy", href: "/academy" }, { label: "Insights", href: "/insights" },
          { label: "Shop", href: "/shop" }, { label: "Brand assessment", href: "/assessment" } ] },
        { title: "About", links: [
          { label: "About", href: "/about" }, { label: "Case studies", href: "/case-studies" },
          { label: "Press & media", href: "/media" }, { label: "Contact", href: "/contact" } ] },
      ]),
    footerNote: z.string().max(300).default(""),
    newsletterEyebrow: z.string().max(40).default("Newsletter"),
    newsletterHeading: z.string().max(160).default("Notes on building a brand that *outlasts* the feed."),
  }),
  announcement: z.object({
    enabled: z.boolean().default(false),
    text: z.string().max(160).default(""),
    href: url.default(""),
    startsAt: z.string().default(""),
    endsAt: z.string().default(""),
  }),
  links: z.object({
    headline: z.string().max(120).default(""),
    items: z.array(link.extend({ highlight: z.boolean().default(false) })).max(20).default([]),
  }),
  email: z.object({
    fromName: z.string().max(80).default(""),
    replyTo: z.union([z.literal(""), z.string().email()]).default(""),
    footerText: z.string().max(400).default(""),
    adminAlertEmail: z.union([z.literal(""), z.string().email()]).default(""),
  }),
  features: z.object({
    shop: z.boolean().default(true),
    academy: z.boolean().default(true),
    assessment: z.boolean().default(true),
    sms: z.boolean().default(false),
    ai: z.boolean().default(false),
  }),
  onboarding: z.object({
    dismissed: z.boolean().default(false),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[];

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): Settings[K] {
  const result = settingSchemas[key].safeParse(raw ?? {});
  if (result.success) return result.data as Settings[K];
  // Invalid stored value: fall back to defaults rather than breaking the site.
  return settingSchemas[key].parse({}) as Settings[K];
}
