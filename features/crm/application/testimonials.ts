import "server-only";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { signValue, verifySignedValue } from "@/lib/security/crypto";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { enqueueEmail } from "@/features/notifications/application/send";
import { logActivity } from "./contacts";

/**
 * Asks a real client for a testimonial. Only contacts with a genuine
 * relationship (paid order, attended/confirmed appointment or masterclass)
 * can be asked, at most once every 90 days, and suppressed addresses are
 * never emailed. Responses arrive as PENDING and need approval + consent.
 */
export async function requestTestimonial(contactId: string, actorId: string): Promise<void> {
  const c = await db.one<{ id: string; email: string | null; full_name: string; client: boolean; suppressed: boolean; recent: boolean }>(
    `select c.id, c.email::text as email, c.full_name,
            (exists (select 1 from orders o where o.contact_id = c.id and o.status in ('paid','partially_refunded'))
             or exists (select 1 from appointments a where a.contact_id = c.id and a.status in ('confirmed','completed') and a.starts_at < now())
             or exists (select 1 from event_registrations r where r.contact_id = c.id and r.status = 'confirmed')) as client,
            exists (select 1 from email_suppressions s where s.email = c.email) as suppressed,
            exists (select 1 from notifications n where n.template_key = 'testimonial_request' and n.related_type = 'contact' and n.related_id = c.id::text and n.created_at > now() - interval '90 days') as recent
       from contacts c where c.id = $1`,
    [contactId],
  );
  if (!c) throw new UserError("Contact not found.");
  if (!c.email) throw new UserError("This contact has no email address.");
  if (!c.client) throw new UserError("Only clients who have bought, booked or attended can be asked for a testimonial.");
  if (c.suppressed) throw new UserError("This person has unsubscribed or their address bounced, so they can't be emailed.");
  if (c.recent) throw new UserError("A testimonial request was already sent to this person in the last 90 days.");
  const token = signValue(`tr:${c.id}`, Math.floor(Date.now() / 1000) + 30 * 86400);
  await enqueueEmail({
    to: c.email, template: "testimonial_request",
    data: { name: c.full_name || "there", testimonialUrl: `${env().APP_URL}/testimonials/share?r=${encodeURIComponent(token)}` },
    idempotencyKey: `testimonial-request:${c.id}:${new Date().toISOString().slice(0, 10)}`,
    related: { type: "contact", id: c.id },
  });
  await logActivity(db, c.id, "email", "Testimonial requested", { actorId });
  await audit({ actorId, action: "testimonial.request", entityType: "contact", entityId: c.id });
}

/** Resolves a testimonial-request token to the contact it was sent to (for pre-filling and verification). */
export async function contactForTestimonialToken(token: string | undefined): Promise<{ id: string; name: string; email: string } | null> {
  if (!token || token.length > 400) return null;
  const v = verifySignedValue(token);
  if (!v?.startsWith("tr:")) return null;
  const c = await db.one<{ id: string; full_name: string; email: string }>("select id, full_name, email::text as email from contacts where id = $1", [v.slice(3)]);
  return c ? { id: c.id, name: c.full_name, email: c.email } : null;
}
