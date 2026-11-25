import "server-only";
import ExcelJS from "exceljs";
import { z } from "zod";
import { tx } from "@/lib/database/pool";
import { parseCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { logActivity, upsertContact } from "./contacts";
import { CrmError } from "./admin";

const HEADER_MAP: Record<string, string> = {
  name: "fullName", "full name": "fullName", fullname: "fullName", "first name": "firstName", "last name": "lastName",
  email: "email", "email address": "email", "e-mail": "email",
  phone: "phone", "phone number": "phone", mobile: "phone", telephone: "phone",
  company: "company", organisation: "company", organization: "company",
  title: "jobTitle", "job title": "jobTitle", role: "jobTitle", position: "jobTitle",
  tags: "tags", tag: "tags", source: "source", consent: "consent", "marketing consent": "consent",
};

export type ImportReport = { created: number; updated: number; skipped: { row: number; reason: string }[] };

async function readRows(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new CrmError("File is larger than 5 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(buf.toString("utf8"));
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new CrmError("The workbook has no sheets.");
    const rows: string[][] = [];
    ws.eachRow((r) => {
      const values = (r.values as unknown[]).slice(1).map((v) => {
        if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
        if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
        return v === null || v === undefined ? "" : String(v);
      });
      rows.push(values);
    });
    return rows;
  }
  throw new CrmError("Upload a .csv or .xlsx file.");
}

/**
 * Imports contacts, de-duplicating by email (existing contacts are updated,
 * never overwritten with blanks). Marketing consent is imported ONLY when the
 * operator confirms documented consent AND the row says yes.
 */
export async function importContacts(file: File, opts: { confirmConsent: boolean; tag?: string }, actorId: string): Promise<ImportReport> {
  const rows = await readRows(file);
  if (rows.length < 2) throw new CrmError("The file needs a header row and at least one contact.");
  if (rows.length > 5001) throw new CrmError("Import up to 5,000 contacts at a time.");
  const headers = rows[0].map((h) => HEADER_MAP[h.trim().toLowerCase()] ?? null);
  if (!headers.includes("email") && !headers.includes("phone")) throw new CrmError("Couldn't find an Email or Phone column.");
  const report: ImportReport = { created: 0, updated: 0, skipped: [] };
  const emailSchema = z.string().email();

  await tx(async (t) => {
    for (let r = 1; r < rows.length; r++) {
      const rec: Record<string, string> = {};
      headers.forEach((h, i) => { if (h) rec[h] = (rows[r][i] ?? "").trim(); });
      const email = rec.email?.toLowerCase() || "";
      if (email && !emailSchema.safeParse(email).success) { report.skipped.push({ row: r + 1, reason: `invalid email "${email}"` }); continue; }
      if (!email && !rec.phone) { report.skipped.push({ row: r + 1, reason: "no email or phone" }); continue; }
      const fullName = rec.fullName || [rec.firstName, rec.lastName].filter(Boolean).join(" ");
      const consent = opts.confirmConsent && /^(y|yes|true|1|opted in)$/i.test(rec.consent ?? "");
      const res = await upsertContact(t, {
        email: email || null, fullName, phone: rec.phone?.slice(0, 32) || null, company: rec.company, jobTitle: rec.jobTitle,
        source: rec.source || "import", consentMarketing: consent, consentSource: consent ? `Import ${file.name} (operator-confirmed)` : undefined,
      });
      if (res.created) report.created++; else report.updated++;
      const tags = [...(rec.tags ?? "").split(/[;,|]/), opts.tag ?? ""].map((x) => x.trim()).filter(Boolean);
      for (const tag of tags.slice(0, 10)) {
        const row = await t.one<{ id: string }>("insert into crm_tags (name) values ($1) on conflict (name) do update set name = crm_tags.name returning id", [tag.slice(0, 40)]);
        await t.query("insert into contact_tags (contact_id, tag_id) values ($1,$2) on conflict do nothing", [res.id, row!.id]);
      }
      if (res.created) await logActivity(t, res.id, "system", `Imported from ${file.name}`, { actorId });
    }
    await audit({ actorId, action: "contact.import", entityType: "contact", data: { file: file.name, created: report.created, updated: report.updated, skipped: report.skipped.length } }, t);
  });
  return report;
}
