import "server-only";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { formatDate } from "@/lib/time";
import { enqueueEmail } from "@/features/notifications/application/send";
import { loadSettings } from "@/features/settings/application/settings";

function certificateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(12);
  const chars = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
  return `CERT-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Issues a certificate once per (course|event, contact). Returns the code or null if one exists. */
export async function issueCertificate(input: { contactId: string; courseId?: string; eventId?: string; recipientName: string; title: string; email: string; userId?: string | null }): Promise<string | null> {
  const code = certificateCode();
  const row = await db.one<{ code: string }>(
    `insert into certificates (code, contact_id, user_id, course_id, event_id, recipient_name, title) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict do nothing returning code`,
    [code, input.contactId, input.userId ?? null, input.courseId ?? null, input.eventId ?? null, input.recipientName.slice(0, 150), input.title.slice(0, 200)],
  );
  if (!row) return null;
  await enqueueEmail({
    to: input.email, template: "certificate_available",
    data: { name: input.recipientName, title: input.title, code: row.code, certificateUrl: `${env().APP_URL}/portal/certificates` },
    idempotencyKey: `certificate:${row.code}`,
  });
  return row.code;
}

export async function verifyCertificate(code: string) {
  if (!/^CERT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return null;
  return db.one<{ code: string; recipient_name: string; title: string; issued_at: Date; revoked_at: Date | null }>(
    "select code, recipient_name, title, issued_at, revoked_at from certificates where code = $1",
    [code],
  );
}

export async function renderCertificatePdf(code: string): Promise<Uint8Array | null> {
  const c = await verifyCertificate(code);
  if (!c || c.revoked_at) return null;
  const s = await loadSettings();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const ink = hex(s.theme.ink), accent = hex(s.theme.accent);
  const clean = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, "");
  const center = (text: string, y: number, size: number, font = serif, color = ink) => {
    const t = clean(text);
    page.drawText(t, { x: (842 - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };
  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: accent, borderWidth: 1 });
  page.drawRectangle({ x: 32, y: 32, width: 778, height: 531, borderColor: accent, borderWidth: 0.5 });
  center("CERTIFICATE OF COMPLETION", 470, 13, sans, accent);
  center("This certifies that", 410, 16, serifItalic);
  center(c.recipient_name, 350, 40);
  center("has successfully completed", 300, 16, serifItalic);
  center(c.title, 255, 24);
  center(`${s.brand.name}${s.brand.professionalTitle ? ` - ${s.brand.professionalTitle}` : ""}`, 160, 14);
  center(`Issued ${formatDate(c.issued_at, s.business.timezone)}`, 135, 11, sans);
  center(`Verify at ${env().APP_URL}/certificates/verify?code=${c.code}`, 70, 9, sans, accent);
  return pdf.save();
}
