"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { UserError } from "@/lib/errors";
import { fromLocalInput } from "@/lib/time";
import { parseMajorToMinor } from "@/lib/money";
import { loadSetting } from "@/features/settings/application/settings";
import { audienceSchema, startCampaign } from "../application/campaigns";
import { enqueueEmail } from "@/features/notifications/application/send";

export async function saveCampaignAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("marketing:manage");
    const i = z.object({
      id: z.union([z.literal(""), z.string().uuid()]).default(""), name: z.string().trim().min(1).max(150), subject: z.string().trim().min(1).max(200),
      preheader: z.string().max(200).default(""), body: z.string().trim().min(10, "Write the email body").max(100000),
      audienceType: z.enum(["all_subscribers", "list", "tag"]), audienceId: z.string().default(""),
    }).parse(Object.fromEntries(fd));
    const audience = audienceSchema.parse(i.audienceType === "list" ? { type: "list", listId: i.audienceId } : i.audienceType === "tag" ? { type: "tag", tagId: i.audienceId } : { type: "all_subscribers" });
    let id = i.id;
    if (id) {
      const r = await db.query("update campaigns set name=$2, subject=$3, preheader=$4, body=$5, audience=$6 where id=$1 and status in ('draft','scheduled') returning id", [id, i.name, i.subject, i.preheader, i.body, JSON.stringify(audience)]);
      if (!r.length) throw new UserError("Sent campaigns can't be edited.");
    } else {
      id = (await db.one<{ id: string }>("insert into campaigns (name, subject, preheader, body, audience, created_by) values ($1,$2,$3,$4,$5,$6) returning id", [i.name, i.subject, i.preheader, i.body, JSON.stringify(audience), u.id]))!.id;
    }
    return { redirect: `/admin/marketing/campaigns/${id}` };
  });
}

export async function campaignSendAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("marketing:manage");
    const id = z.string().uuid().parse(fd.get("id"));
    const op = z.enum(["send", "schedule", "cancel", "test"]).parse(fd.get("op"));
    if (op === "test") {
      const c = await db.one<{ subject: string; body: string }>("select subject, body from campaigns where id = $1", [id]);
      await enqueueEmail({ to: u.email, template: "campaign", data: { subject: `[TEST] ${c!.subject}`, content: c!.body.replace(/\{\{\s*name\s*\}\}/g, u.fullName || "there") }, idempotencyKey: `campaign-test:${id}:${Date.now()}` });
      return undefined;
    }
    if (op === "cancel") { await db.query("update campaigns set status = 'cancelled' where id = $1 and status = 'scheduled'", [id]); return undefined; }
    if (op === "schedule") {
      const when = fromLocalInput(String(fd.get("when")), (await loadSetting("business")).timezone);
      if (!when || when < new Date()) throw new UserError("Choose a future time.");
      await db.query("update campaigns set status = 'scheduled', scheduled_at = $2 where id = $1 and status = 'draft'", [id, when]);
      await audit({ actorId: u.id, action: "campaign.schedule", entityType: "campaign", entityId: id });
      return undefined;
    }
    if (fd.get("confirm") !== "on") throw new UserError("Tick the confirmation box to send.");
    await startCampaign(id, u.id);
    return undefined;
  });
}

export async function saveLinkAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    const i = z.object({
      name: z.string().trim().min(1).max(120), slug: z.string().trim().max(60).default(""), destination: z.string().trim().refine((v) => /^(\/(?!\/)|https:\/\/)/.test(v), "Must start with / or https://"),
      channel: z.enum(["linkedin", "instagram", "x", "facebook", "tiktok", "youtube", "email", "whatsapp_share", "referral", "other"]),
      utmCampaign: z.string().max(100).default(""), utmContent: z.string().max(100).default(""), referrerEmail: z.string().default(""),
    }).parse(Object.fromEntries(fd));
    const slug = slugify(i.slug || i.name, 50);
    let referrer: string | null = null;
    if (i.referrerEmail) {
      referrer = (await db.one<{ id: string }>("select id from contacts where email = $1", [i.referrerEmail.toLowerCase()]))?.id ?? null;
      if (!referrer) throw new UserError("No contact with that email for the referral.");
    }
    await db.query(
      `insert into campaign_links (slug, name, destination, channel, utm_source, utm_medium, utm_campaign, utm_content, referrer_contact_id)
       values ($1,$2,$3,$4,$4,$5,$6,nullif($7,''),$8)`,
      [slug, i.name, i.destination, i.channel, i.channel === "email" ? "email" : i.channel === "referral" ? "referral" : "social", i.utmCampaign || slug, i.utmContent, referrer],
    ).catch((e) => { if ((e as { code?: string }).code === "23505") throw new UserError("That short link is taken."); throw e; });
    return undefined;
  });
}

export async function toggleLinkAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    await db.query("update campaign_links set active = not active where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    return undefined;
  });
}

export async function saveDiscountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("marketing:manage");
    const i = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "3–40 letters, numbers, - or _"), description: z.string().max(200).default(""),
      kind: z.enum(["percent", "fixed"]), value: z.string(), currency: z.string().length(3).default("GHS"),
      appliesTo: z.enum(["all", "appointment", "event_ticket", "course", "product"]), maxRedemptions: z.string().default(""),
      perCustomerLimit: z.coerce.number().int().min(1).max(100).default(1), startsAt: z.string().default(""), endsAt: z.string().default(""),
    }).parse(Object.fromEntries(fd));
    const tz = (await loadSetting("business")).timezone;
    const value = i.kind === "percent" ? z.coerce.number().int().min(1).max(100).parse(i.value) : parseMajorToMinor(i.value, i.currency);
    await db.query(
      `insert into discount_codes (code, description, kind, value, currency, applies_to, max_redemptions, per_customer_limit, starts_at, ends_at)
       values ($1,$2,$3,$4,$5,$6,nullif($7,'')::int,$8,$9,$10)`,
      [i.code, i.description, i.kind, value, i.kind === "fixed" ? i.currency.toUpperCase() : null, i.appliesTo, i.maxRedemptions, i.perCustomerLimit, fromLocalInput(i.startsAt, tz), fromLocalInput(i.endsAt, tz)],
    ).catch((e) => { if ((e as { code?: string }).code === "23505") throw new UserError("That code already exists."); throw e; });
    await audit({ actorId: u.id, action: "discount.create", entityType: "discount", entityId: i.code });
    return undefined;
  });
}

export async function toggleDiscountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    await db.query("update discount_codes set active = not active where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    return undefined;
  });
}
