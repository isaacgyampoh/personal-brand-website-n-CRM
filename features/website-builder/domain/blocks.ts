import { z } from "zod";

/**
 * Structured, validated content model for the visual website builder.
 * - Only these block types can be stored or rendered.
 * - Text is plain text (rendered escaped); no HTML or script is accepted.
 * - Links/images are restricted to safe schemes.
 */

const text = (max: number) => z.string().max(max).default("");
export const safeHref = z
  .string()
  .max(500)
  .default("")
  .refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v) || /^mailto:/.test(v) || /^tel:/.test(v) || v.startsWith("#"), {
    message: "Links must start with /, https://, mailto: or tel:",
  });
export const safeImage = z
  .string()
  .max(500)
  .default("")
  .refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v), { message: "Images must be uploaded or use https://" });
const videoUrl = z
  .string()
  .max(300)
  .default("")
  .refine((v) => v === "" || /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//.test(v), {
    message: "Only YouTube or Vimeo links are supported",
  });
const cta = z.object({ label: text(60), href: safeHref }).default({ label: "", href: "" });
const tone = z.enum(["paper", "surface", "ink", "accent"]).default("paper");
const id = z.string().max(80).optional();

export const blockSchemas = {
  Hero: z.object({
    id,
    variant: z.enum(["editorial", "statement", "portrait-full"]).default("editorial"),
    eyebrow: text(80),
    headline: text(160),
    emphasis: text(60),
    body: text(500),
    primaryCta: cta,
    secondaryCta: cta,
    imageUrl: safeImage,
    imageAlt: text(200),
    videoUrl,
    tone,
  }),
  Introduction: z.object({
    id, eyebrow: text(80), heading: text(160), body: text(3000), signature: text(80),
    imageUrl: safeImage, imageAlt: text(200), cta, tone,
  }),
  Statement: z.object({ id, statement: text(400), attribution: text(120), tone }),
  EditorialText: z.object({
    id, eyebrow: text(80), heading: text(160), body: text(8000), aside: text(600),
    layout: z.enum(["single", "with-aside", "centered"]).default("single"), tone,
  }),
  ImageText: z.object({
    id, eyebrow: text(80), heading: text(160), body: text(2000), imageUrl: safeImage, imageAlt: text(200),
    imageSide: z.enum(["left", "right"]).default("left"), cta, tone,
  }),
  Services: z.object({
    id, eyebrow: text(80), heading: text(160), intro: text(500),
    source: z.enum(["featured", "all"]).default("featured"), limit: z.number().int().min(1).max(12).default(3), cta, tone,
  }),
  Events: z.object({
    id, eyebrow: text(80), heading: text(160), intro: text(500), limit: z.number().int().min(1).max(9).default(3), cta, tone,
  }),
  Courses: z.object({
    id, eyebrow: text(80), heading: text(160), intro: text(500), limit: z.number().int().min(1).max(9).default(3), cta, tone,
  }),
  Articles: z.object({
    id, eyebrow: text(80), heading: text(160), limit: z.number().int().min(1).max(9).default(3),
    featuredOnly: z.boolean().default(false), cta, tone,
  }),
  Testimonials: z.object({
    id, eyebrow: text(80), heading: text(160), limit: z.number().int().min(1).max(12).default(3),
    featuredOnly: z.boolean().default(true), tone,
  }),
  Stats: z.object({
    id, eyebrow: text(80), heading: text(160),
    items: z.array(z.object({ value: text(20), label: text(80), note: text(160) })).max(6).default([]), tone,
  }),
  Logos: z.object({
    id, heading: text(120),
    items: z.array(z.object({ name: text(80), logoUrl: safeImage, href: safeHref })).max(16).default([]), tone,
  }),
  Timeline: z.object({
    id, eyebrow: text(80), heading: text(160),
    items: z.array(z.object({ year: text(20), title: text(120), body: text(600) })).max(20).default([]), tone,
  }),
  Speaking: z.object({
    id, eyebrow: text(80), heading: text(160), body: text(1000),
    items: z.array(z.object({ title: text(120), detail: text(160) })).max(12).default([]), cta, tone,
  }),
  Gallery: z.object({
    id, heading: text(160),
    images: z.array(z.object({ url: safeImage, alt: text(200), caption: text(200) })).max(24).default([]),
    layout: z.enum(["mosaic", "row"]).default("mosaic"), tone,
  }),
  Video: z.object({ id, heading: text(160), url: videoUrl, caption: text(300), tone }),
  Faq: z.object({
    id, eyebrow: text(80), heading: text(160),
    items: z.array(z.object({ question: text(200), answer: text(2000) })).max(30).default([]), tone,
  }),
  Pricing: z.object({
    id, eyebrow: text(80), heading: text(160), intro: text(500),
    tiers: z.array(z.object({
      name: text(80), price: text(40), period: text(40), description: text(300),
      features: z.array(z.object({ text: text(160) })).max(12).default([]), cta, highlighted: z.boolean().default(false),
    })).max(4).default([]),
    tone,
  }),
  Newsletter: z.object({ id, eyebrow: text(80), heading: text(160), body: text(500), buttonLabel: text(40), tone }),
  CallToAction: z.object({ id, eyebrow: text(80), heading: text(200), body: text(600), primaryCta: cta, secondaryCta: cta, tone }),
  BookingCard: z.object({ id, heading: text(160), body: text(500), serviceSlug: z.string().max(100).default(""), tone }),
  Assessment: z.object({ id, eyebrow: text(80), heading: text(160), body: text(500), assessmentSlug: z.string().max(100).default(""), cta, tone }),
  /** Live biography from Studio → Business profile (edit the profile, not the page). */
  Profile: z.object({
    id, eyebrow: text(80), heading: text(160), imageUrl: safeImage, imageAlt: text(200),
    showExpertise: z.boolean().default(true), showQualifications: z.boolean().default(true),
    showAchievements: z.boolean().default(true), showMission: z.boolean().default(true), tone,
  }),
  Spacer: z.object({ id, size: z.enum(["sm", "md", "lg"]).default("md"), divider: z.boolean().default(false) }),
} as const;

export type BlockType = keyof typeof blockSchemas;
export const BLOCK_TYPES = Object.keys(blockSchemas) as BlockType[];
export type BlockProps<T extends BlockType> = z.infer<(typeof blockSchemas)[T]>;

const blockSchema = z.discriminatedUnion(
  "type",
  // Every section can be hidden without deleting it (Studio → Website → "Hide this section").
  BLOCK_TYPES.map((type) => z.object({ type: z.literal(type), props: (blockSchemas[type] as z.ZodObject<z.ZodRawShape>).extend({ hidden: z.boolean().default(false) }) })) as unknown as [
    z.ZodObject<{ type: z.ZodLiteral<BlockType>; props: z.ZodTypeAny }>,
    ...z.ZodObject<{ type: z.ZodLiteral<BlockType>; props: z.ZodTypeAny }>[],
  ],
);

export type Block = { [T in BlockType]: { type: T; props: BlockProps<T> } }[BlockType];

export const pageDataSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()).default({}) }).default({ props: {} }),
  content: z.array(blockSchema).max(60).default([]),
  zones: z.record(z.string(), z.array(z.unknown())).optional(),
});

export type PageData = { root: { props: Record<string, unknown> }; content: Block[] };

export const pageSeoSchema = z.object({
  title: z.string().max(80).default(""),
  description: z.string().max(300).default(""),
  ogImageUrl: safeImage,
  noindex: z.boolean().default(false),
  canonical: z.string().max(300).default(""),
});
export type PageSeo = z.infer<typeof pageSeoSchema>;
