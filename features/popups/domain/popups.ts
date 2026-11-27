import { z } from "zod";
import { registrationState, type EventLike } from "@/features/events/domain/rules";

export const POPUP_KINDS = [
  ["event", "Masterclass / event registration"],
  ["announcement", "Upcoming event announcement"],
  ["coaching", "Coaching promotion"],
  ["course", "New course announcement"],
  ["offer", "Special offer"],
  ["newsletter", "Newsletter subscription"],
  ["resource", "Free resource download"],
  ["custom", "Custom announcement"],
] as const;
export const POPUP_LAYOUTS = [
  ["editorial", "Editorial — image and text"],
  ["flyer", "Full promotional flyer"],
  ["minimal", "Minimal announcement"],
  ["countdown", "Countdown registration"],
  ["sheet", "Bottom sheet (slides up, no overlay)"],
] as const;
export type PopupKind = (typeof POPUP_KINDS)[number][0];
export type PopupLayout = (typeof POPUP_LAYOUTS)[number][0];

const hex = z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #8c2350")]);
const dest = z.string().trim().max(500).refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\/[^\s]+$/.test(v), "Use a page on this site (starting with /) or a full https:// link");

/** Studio form input. Dates arrive already converted to Date by the action. */
export const popupInput = z.object({
  name: z.string().trim().min(1, "Give the pop-up a name").max(120),
  kind: z.enum(POPUP_KINDS.map((k) => k[0]) as [PopupKind, ...PopupKind[]]),
  eventId: z.union([z.literal(""), z.string().uuid()]).default(""),
  layout: z.enum(POPUP_LAYOUTS.map((k) => k[0]) as [PopupLayout, ...PopupLayout[]]),
  eyebrow: z.string().trim().max(60).default(""),
  heading: z.string().trim().max(140).default(""),
  body: z.string().trim().max(600).default(""),
  buttonText: z.string().trim().max(40).default(""),
  destination: dest.default(""),
  imageMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  accent: hex.default(""), background: hex.default(""), text: hex.default(""),
  pages: z.enum(["all", "home", "selected"]).default("all"),
  pagePaths: z.string().max(2000).default("").transform((s) => s.split(/[\n,]+/).map((p) => p.trim()).filter((p) => /^\/[a-z0-9/_-]*\*?$/i.test(p)).slice(0, 40)),
  devices: z.enum(["all", "mobile", "desktop"]).default("all"),
  delaySeconds: z.coerce.number().int().min(0).max(120).default(5),
  frequency: z.enum(["session", "dismiss_period", "every_page"]).default("dismiss_period"),
  dismissDays: z.coerce.number().int().min(0).max(365).default(7),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
}).superRefine((v, ctx) => {
  if (v.kind === "event" && !v.eventId) ctx.addIssue({ code: "custom", path: ["eventId"], message: "Choose the masterclass or event" });
  if (v.kind !== "event" && v.kind !== "newsletter" && !v.destination) ctx.addIssue({ code: "custom", path: ["destination"], message: "Where should the button go?" });
  if (v.kind !== "event" && !v.heading) ctx.addIssue({ code: "custom", path: ["heading"], message: "Add a heading" });
  if (v.pages === "selected" && !v.pagePaths.length) ctx.addIssue({ code: "custom", path: ["pagePaths"], message: "List at least one page, e.g. /about" });
});
export type PopupInput = z.infer<typeof popupInput>;

/** Never shown on these paths, whatever the targeting says. */
const NEVER = /^\/(admin|studio|portal|api|checkout|login|register|forgot-password|reset-password|verify-email|auth|book|go|feedback|certificates)(\/|$)|\/registered(\/|$)/;

export function pathAllowed(path: string): boolean {
  return !NEVER.test(path);
}

export function pathTargeted(p: { pages: "all" | "home" | "selected"; page_paths: string[] }, path: string): boolean {
  if (!pathAllowed(path)) return false;
  if (p.pages === "all") return true;
  if (p.pages === "home") return path === "/";
  return p.page_paths.some((t) => (t.endsWith("*") ? path.startsWith(t.slice(0, -1)) : path === t || path === `${t.replace(/\/$/, "")}/`));
}

export type EventSnapshot = EventLike & { waitlist_enabled: boolean; seatsLeft: number | null; ticketsOnSale: number };

/**
 * What an event pop-up should do right now. Hidden when registration is not open
 * (closed, not yet open, ended, cancelled, draft/unpublished) or when it is sold
 * out without a waiting list. Sold out + waiting list → "Join the waiting list".
 */
export function eventPopupState(e: EventSnapshot, now = new Date()): "register" | "waitlist" | "hidden" {
  if (registrationState(e, now) !== "open") return "hidden";
  const soldOut = e.ticketsOnSale === 0 || e.seatsLeft === 0;
  if (!soldOut) return "register";
  return e.waitlist_enabled ? "waitlist" : "hidden";
}

/** Seat line shown on the pop-up — only when it is true and useful (never "unlimited"). */
export function seatsLabel(seatsLeft: number | null): string | null {
  if (seatsLeft === null || seatsLeft <= 0) return null;
  return seatsLeft <= 20 ? `Only ${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left` : null;
}

/** Public payload sent to the browser (no ids of private data, no internal fields). */
export type PublicPopup = {
  id: string; kind: PopupKind; layout: PopupLayout;
  eyebrow: string; heading: string; body: string; buttonText: string; href: string;
  image: { src: string; srcSet?: string; alt: string } | null;
  colors: { accent?: string; background?: string; text?: string };
  devices: "all" | "mobile" | "desktop"; delaySeconds: number; frequency: "session" | "dismiss_period" | "every_page"; dismissDays: number;
  /** Event details (event pop-ups only). */
  event?: { startsAt: string; timezone: string; dateLabel: string; deadlineLabel: string | null; priceLabel: string; seatsLabel: string | null; countdownTo: string; slug: string };
  /** Pages where this pop-up must not show (e.g. its own event page). */
  excludePath?: string;
};
