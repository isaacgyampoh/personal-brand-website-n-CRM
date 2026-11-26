"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { invalidate } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { UserError } from "@/lib/errors";
import { docFromText } from "@/features/content/domain/rich-text";
import { parseMajorToMinor } from "@/lib/money";

const on = (fd: FormData, k: string) => fd.get(k) === "on";

export async function testimonialAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("content:edit");
    const op = z.enum(["approve", "reject", "feature", "save", "create", "delete"]).parse(fd.get("op"));
    const id = String(fd.get("id") ?? "");
    if (op === "create" || op === "save") {
      const i = z.object({ authorName: z.string().trim().min(1).max(120), authorTitle: z.string().max(120).default(""), company: z.string().max(120).default(""), quote: z.string().trim().min(10).max(2000), consentNote: z.string().max(300).default("") }).parse(Object.fromEntries(fd));
      const consent = on(fd, "consentConfirmed");
      if (op === "create") {
        await db.query("insert into testimonials (author_name, author_title, company, quote, source, consent_confirmed, consent_note, photo_media_id) values ($1,$2,$3,$4,'manual',$5,$6,nullif($7,'')::uuid)",
          [i.authorName, i.authorTitle, i.company, i.quote, consent, i.consentNote, String(fd.get("photoMediaId") ?? "")]);
      } else {
        await db.query("update testimonials set author_name=$2, author_title=$3, company=$4, quote=$5, consent_confirmed=$6, consent_note=$7 where id=$1", [id, i.authorName, i.authorTitle, i.company, i.quote, consent, i.consentNote]);
      }
    } else if (op === "approve") {
      const t = await db.one<{ consent_confirmed: boolean }>("select consent_confirmed from testimonials where id = $1", [id]);
      if (!t?.consent_confirmed) throw new UserError("Record the person's consent before approving (edit the testimonial and tick consent).");
      await db.query("update testimonials set status = 'approved', approved_at = now() where id = $1", [id]);
    } else if (op === "reject") await db.query("update testimonials set status = 'rejected', featured = false where id = $1", [id]);
    else if (op === "feature") await db.query("update testimonials set featured = not featured where id = $1", [id]);
    else if (op === "delete") await db.query("delete from testimonials where id = $1", [id]);
    await audit({ actorId: u.id, action: `testimonial.${op}`, entityType: "testimonial", entityId: id || null });
    invalidate("proof");
    return undefined;
  });
}

export async function caseStudyAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    const i = z.object({ id: z.string().default(""), title: z.string().trim().min(1).max(200), clientName: z.string().max(150).default(""), summary: z.string().max(600).default(""), challenge: z.string().max(10000).default(""), approach: z.string().max(10000).default(""), outcome: z.string().max(10000).default(""), coverMediaId: z.string().default(""), status: z.enum(["draft", "published", "archived"]) }).parse(Object.fromEntries(fd));
    const consent = on(fd, "consentConfirmed");
    if (i.status === "published" && !consent) throw new UserError("Confirm the client's permission before publishing a case study.");
    const vals = [slugify(i.title), i.title, i.clientName, i.summary, JSON.stringify(docFromText(i.challenge)), JSON.stringify(docFromText(i.approach)), JSON.stringify(docFromText(i.outcome)), i.coverMediaId || null, consent, i.status];
    if (i.id) await db.query("update case_studies set slug=$1,title=$2,client_name=$3,summary=$4,challenge=$5,approach=$6,outcome=$7,cover_media_id=$8,consent_confirmed=$9,status=$10, published_at = case when $10='published' then coalesce(published_at, now()) else published_at end where id=$11", [...vals, i.id]);
    else await db.query("insert into case_studies (slug,title,client_name,summary,challenge,approach,outcome,cover_media_id,consent_confirmed,status,published_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $10='published' then now() end)", vals);
    invalidate("proof");
    return undefined;
  });
}

export async function appearanceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    if (fd.get("op") === "delete") { await db.query("delete from media_appearances where id = $1", [z.string().uuid().parse(fd.get("id"))]); invalidate("proof"); return undefined; }
    const i = z.object({ kind: z.enum(["interview", "podcast", "video", "press", "speaking_engagement"]), title: z.string().trim().min(1).max(200), outlet: z.string().max(150).default(""), url: z.union([z.literal(""), z.string().url().startsWith("https://")]).default(""), appearedOn: z.string().default(""), description: z.string().max(1000).default("") }).parse(Object.fromEntries(fd));
    await db.query("insert into media_appearances (kind, title, outlet, url, appeared_on, description, published, featured) values ($1,$2,$3,nullif($4,''),nullif($5,'')::date,$6,$7,$8)", [i.kind, i.title, i.outlet, i.url, i.appearedOn, i.description, on(fd, "published"), on(fd, "featured")]);
    invalidate("proof");
    return undefined;
  });
}

export async function topicAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    if (fd.get("op") === "delete") { await db.query("delete from speaking_topics where id = $1", [z.string().uuid().parse(fd.get("id"))]); invalidate("proof"); return undefined; }
    const i = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(1500).default(""), audience: z.string().max(200).default(""), formats: z.string().default("") }).parse(Object.fromEntries(fd));
    await db.query("insert into speaking_topics (title, description, audience, formats, position) values ($1,$2,$3,$4,(select count(*) from speaking_topics))", [i.title, i.description, i.audience, i.formats.split(",").map((s) => s.trim()).filter(Boolean)]);
    invalidate("proof");
    return undefined;
  });
}

export async function opportunityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    const op = String(fd.get("op") ?? "save");
    if (op === "stage") {
      await db.query("update opportunities set stage = $2 where id = $1", [z.string().uuid().parse(fd.get("id")), z.enum(["enquiry", "qualifying", "proposal", "negotiation", "confirmed", "completed", "declined"]).parse(fd.get("stage"))]);
      return undefined;
    }
    const i = z.object({ id: z.string().default(""), kind: z.enum(["speaking", "corporate_training", "sponsorship", "brand_partnership", "collaboration", "media", "event_invitation"]), title: z.string().trim().min(1).max(200), organisation: z.string().max(200).default(""), fee: z.string().default(""), currency: z.string().length(3).default("GHS"), eventDate: z.string().default(""), location: z.string().max(200).default(""), notes: z.string().max(10000).default(""), nextFollowUpAt: z.string().default("") }).parse(Object.fromEntries(fd));
    const fee = i.fee ? parseMajorToMinor(i.fee, i.currency) : null;
    const vals = [i.kind, i.title, i.organisation, fee, i.currency, i.eventDate || null, i.location, i.notes, i.nextFollowUpAt || null];
    if (i.id) await db.query("update opportunities set kind=$1,title=$2,organisation=$3,fee_minor=$4,currency=$5,event_date=$6::date,location=$7,notes=$8,next_follow_up_at=$9::date where id=$10", [...vals, i.id]);
    else await db.query("insert into opportunities (kind,title,organisation,fee_minor,currency,event_date,location,notes,next_follow_up_at) values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9::date)", vals);
    await audit({ actorId: u.id, action: "opportunity.save", entityType: "opportunity", entityId: i.id || null });
    return undefined;
  });
}

export async function submissionStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("crm:edit");
    await db.query("update form_submissions set status = $2 where id = $1", [z.string().uuid().parse(fd.get("id")), z.enum(["reviewed", "archived", "spam", "new"]).parse(fd.get("status"))]);
    return undefined;
  });
}
