"use server";

import { contactForTestimonialToken } from "@/features/crm/application/testimonials";

import { z } from "zod";
import { tx } from "@/lib/database/pool";
import { rateLimit } from "@/lib/security/rate-limit";
import { ipHash } from "@/lib/security/request";
import { runAction, type ActionResult } from "@/lib/actions";
import { currentAttribution } from "@/lib/attribution";
import { getCurrentUser } from "@/lib/auth/session";
import { subscribe } from "@/features/marketing/application/subscribers";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { alertAdmin } from "@/features/notifications/application/send";
import { availableDays, availableSlots, createBooking } from "@/features/bookings/application/booking";
import { bookingRepo } from "@/features/bookings/infrastructure/repository";
import { registerForEvent, joinWaitlist } from "@/features/events/application/registration";
import { purchaseCatalogItem } from "@/features/commerce/application/purchase";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const name = z.string().trim().min(2, "Enter your name").max(120);
const phone = z.string().trim().max(32).regex(/^[+\d\s()-]*$/, "Enter a valid phone number").optional().default("");

async function guard(bucket: string, limit: number, windowSeconds: number) {
  await rateLimit(`${bucket}:${await ipHash()}`, limit, windowSeconds);
}

/** Honeypot: bots fill hidden fields. */
function isBot(fd: FormData) {
  return Boolean(fd.get("website"));
}

// ---------------------------------------------------------------------------
export async function subscribeAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (isBot(fd)) return undefined;
    await guard("subscribe", 5, 600);
    const input = z.object({ email, fullName: z.string().trim().max(120).optional(), source: z.string().max(40).default("website"), consent: z.literal("on", { message: "Please confirm you'd like to subscribe" }) })
      .parse(Object.fromEntries(fd));
    await subscribe({ email: input.email, fullName: input.fullName, source: input.source, attribution: await currentAttribution() });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
const enquirySchema = z.object({
  form: z.enum(["contact", "speaking", "partnership", "corporate_training", "media"]),
  fullName: name,
  email,
  phone,
  organisation: z.string().trim().max(150).optional().default(""),
  subject: z.string().trim().max(150).optional().default(""),
  message: z.string().trim().min(10, "Please add a little more detail").max(5000),
  eventDate: z.string().trim().max(40).optional().default(""),
  budget: z.string().trim().max(80).optional().default(""),
  consentMarketing: z.string().optional(),
});

const OPPORTUNITY_KIND: Record<string, string | null> = {
  contact: null, speaking: "speaking", partnership: "brand_partnership", corporate_training: "corporate_training", media: "media",
};

export async function enquiryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (isBot(fd)) return undefined;
    await guard("enquiry", 5, 900);
    const input = enquirySchema.parse(Object.fromEntries(fd));
    const hash = await ipHash();
    await tx(async (t) => {
      const { id: contactId } = await upsertContact(t, {
        email: input.email, fullName: input.fullName, phone: input.phone || null, company: input.organisation,
        source: `form:${input.form}`, attribution: await currentAttribution(),
        consentMarketing: input.consentMarketing === "on", consentSource: `${input.form} form`,
      });
      const sub = await t.one<{ id: string }>(
        `insert into form_submissions (form, contact_id, payload, consent_marketing, ip_hash) values ($1,$2,$3,$4,$5) returning id`,
        [input.form, contactId, JSON.stringify({ ...input, consentMarketing: undefined }), input.consentMarketing === "on", hash],
      );
      await logActivity(t, contactId, "form", `${input.form.replace("_", " ")} enquiry`, { body: input.message.slice(0, 2000) });
      const kind = OPPORTUNITY_KIND[input.form];
      if (kind) {
        await t.query(
          `insert into opportunities (kind, title, organisation, contact_id, notes, source_submission_id, next_follow_up_at)
           values ($1,$2,$3,$4,$5,$6, now() + interval '2 days')`,
          [kind, input.subject || `${input.organisation || input.fullName} — ${kind.replace("_", " ")}`, input.organisation, contactId,
           [input.message, input.eventDate && `Date: ${input.eventDate}`, input.budget && `Budget: ${input.budget}`].filter(Boolean).join("\n\n"), sub!.id],
        );
      } else {
        await t.query(
          `insert into tasks (title, contact_id, due_at, priority, related_type, related_id) values ($1,$2, now() + interval '1 day','normal','form_submission',$3)`,
          [`Reply to ${input.fullName}`, contactId, sub!.id],
        );
      }
      await alertAdmin(`New ${input.form.replace("_", " ")} enquiry from ${input.fullName}`, input.message.slice(0, 1000), `form:${sub!.id}`, t);
    });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
export async function bookingDaysAction(serviceSlug: string, startDay: string): Promise<ActionResult<string[]>> {
  return runAction(async () => {
    await guard("slots", 120, 300);
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(startDay);
    const service = await bookingRepo.serviceBySlug(z.string().max(100).parse(serviceSlug));
    if (!service?.is_active) return [];
    return availableDays(service, day, 42);
  });
}

export async function bookingSlotsAction(serviceSlug: string, day: string): Promise<ActionResult<{ start: string; end: string; remaining: number }[]>> {
  return runAction(async () => {
    await guard("slots", 120, 300);
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(day);
    const service = await bookingRepo.serviceBySlug(z.string().max(100).parse(serviceSlug));
    if (!service?.is_active) return [];
    const slots = await availableSlots(service, d);
    return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), remaining: s.remaining }));
  });
}

const bookingSchema = z.object({
  serviceSlug: z.string().max(100),
  startsAt: z.string().datetime(),
  fullName: name,
  email,
  phone,
  notes: z.string().trim().max(2000).optional().default(""),
  timezone: z.string().max(60).optional().default(""),
  discountCode: z.string().trim().max(40).optional().default(""),
  consentMarketing: z.boolean().optional().default(false),
  acceptPolicy: z.literal(true, { message: "Please accept the booking terms" }),
});

export async function createBookingAction(input: z.input<typeof bookingSchema>): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await guard("booking", 10, 600);
    const data = bookingSchema.parse(input);
    const user = await getCurrentUser();
    const result = await createBooking({
      serviceSlug: data.serviceSlug,
      startsAt: data.startsAt,
      customer: { fullName: data.fullName, email: data.email, phone: data.phone, notes: data.notes, timezone: data.timezone, consentMarketing: data.consentMarketing },
      discountCode: data.discountCode || undefined,
      userId: user && user.emailVerified && user.email === data.email ? user.id : null,
      attribution: await currentAttribution(),
    });
    return { redirect: result.kind === "payment" ? result.authorizationUrl : `/book/confirmed?ref=${result.reference}` };
  });
}

// ---------------------------------------------------------------------------
const registrationSchema = z.object({
  eventSlug: z.string().max(100),
  ticketTypeId: z.string().uuid(),
  fullName: name,
  email,
  phone,
  attendees: z.array(z.object({ fullName: name, email })).max(49).default([]),
  discountCode: z.string().trim().max(40).optional().default(""),
  consentMarketing: z.boolean().optional().default(false),
  acceptPolicy: z.literal(true, { message: "Please accept the registration terms" }),
});

export async function registerEventAction(input: z.input<typeof registrationSchema>): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await guard("register", 10, 600);
    const data = registrationSchema.parse(input);
    const user = await getCurrentUser();
    const result = await registerForEvent({
      eventSlug: data.eventSlug,
      ticketTypeId: data.ticketTypeId,
      buyer: { fullName: data.fullName, email: data.email, phone: data.phone, consentMarketing: data.consentMarketing },
      attendees: [{ fullName: data.fullName, email: data.email }, ...data.attendees],
      discountCode: data.discountCode || undefined,
      userId: user && user.emailVerified && user.email === data.email ? user.id : null,
      attribution: await currentAttribution(),
    });
    return { redirect: result.kind === "payment" ? result.authorizationUrl : `/masterclasses/${data.eventSlug}/registered?ref=${result.reference}` };
  });
}

export async function waitlistAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (isBot(fd)) return undefined;
    await guard("waitlist", 5, 600);
    const input = z.object({ eventSlug: z.string().max(100), fullName: name, email, consentMarketing: z.string().optional() }).parse(Object.fromEntries(fd));
    await joinWaitlist({ eventSlug: input.eventSlug, email: input.email, fullName: input.fullName, consentMarketing: input.consentMarketing === "on" });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
const purchaseSchema = z.object({
  type: z.enum(["course", "product"]),
  slug: z.string().max(100),
  fullName: name,
  email,
  discountCode: z.string().trim().max(40).optional().default(""),
  consentMarketing: z.boolean().optional().default(false),
  acceptPolicy: z.literal(true, { message: "Please accept the terms" }),
});

export async function purchaseAction(input: z.input<typeof purchaseSchema>): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await guard("purchase", 10, 600);
    const data = purchaseSchema.parse(input);
    const user = await getCurrentUser();
    const result = await purchaseCatalogItem({
      type: data.type,
      slug: data.slug,
      buyer: { fullName: data.fullName, email: data.email, consentMarketing: data.consentMarketing },
      discountCode: data.discountCode || undefined,
      userId: user && user.emailVerified && user.email === data.email ? user.id : null,
      attribution: await currentAttribution(),
    });
    return { redirect: result.kind === "payment" ? result.authorizationUrl : `/checkout/complete?order=${result.orderReference}` };
  });
}

// ---------------------------------------------------------------------------
const testimonialSchema = z.object({
  authorName: name,
  authorTitle: z.string().trim().max(120).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  email,
  quote: z.string().trim().min(20, "Please write at least a sentence or two").max(2000),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  consentPublish: z.string().optional(),
  requestToken: z.string().max(400).optional(),
});

/** Submitted testimonials are stored as PENDING; nothing is published without admin approval. */
export async function submitTestimonialAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (isBot(fd)) return undefined;
    await guard("testimonial", 3, 3600);
    const input = testimonialSchema.parse(Object.fromEntries(fd));
    // A valid request link ties the testimonial to a verified client.
    const requested = await contactForTestimonialToken(input.requestToken);
    if (requested) input.email = requested.email;
    await tx(async (t) => {
      if (requested) await logActivity(t, requested.id, "form", "Testimonial submitted (requested)");
      await t.query(
        `insert into testimonials (author_name, author_title, company, quote, rating, source, consent_confirmed, consent_note, status, submitted_by_email)
         values ($1,$2,$3,$4,$5,'submitted',$6,$7,'pending',$8)`,
        [input.authorName, input.authorTitle, input.company, input.quote, input.rating ?? null, input.consentPublish === "on",
         input.consentPublish === "on" ? `Consent given via ${requested ? "requested testimonial link (verified client)" : "website form"} on ${new Date().toISOString().slice(0, 10)}` : "", input.email],
      );
      await alertAdmin("New testimonial to review", `${input.authorName}: “${input.quote.slice(0, 200)}”`, `testimonial:${input.email}:${Date.now()}`, t);
    });
    return undefined;
  });
}

export async function eventFeedbackAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await guard("feedback", 10, 3600);
    const { verifySignedValue } = await import("@/lib/security/crypto");
    const input = z.object({ token: z.string().max(400), rating: z.coerce.number().int().min(1).max(5), comments: z.string().max(4000).optional().default(""), mayQuote: z.string().optional() }).parse(Object.fromEntries(fd));
    const v = verifySignedValue(input.token);
    if (!v?.startsWith("feedback:")) throw new (await import("@/lib/errors")).UserError("This feedback link has expired.");
    await tx(async (t) => {
      await t.query(
        `insert into event_feedback (registration_id, rating, comments, may_quote) values ($1,$2,$3,$4)
         on conflict (registration_id) do update set rating = excluded.rating, comments = excluded.comments, may_quote = excluded.may_quote`,
        [v.slice(9), input.rating, input.comments, input.mayQuote === "on"],
      );
    });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
export async function submitAssessmentAction(input: { slug: string; answers: Record<string, string>; email?: string; fullName?: string; consent: boolean }): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await guard("assessment", 10, 3600);
    const { submitAssessment } = await import("@/features/marketing/application/assessments");
    const data = z.object({
      slug: z.string().max(100), answers: z.record(z.string().max(30), z.string().max(30)),
      email: z.union([z.literal(""), email]).optional(), fullName: z.string().trim().max(120).optional(), consent: z.boolean(),
    }).parse(input);
    const token = await submitAssessment(data.slug, data.answers, { email: data.email || undefined, fullName: data.fullName, consent: data.consent });
    return { redirect: `/assessment/results/${token}` };
  });
}
