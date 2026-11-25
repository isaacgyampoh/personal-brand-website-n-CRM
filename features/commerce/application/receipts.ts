import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, type Db } from "@/lib/database/pool";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { loadSettings } from "@/features/settings/application/settings";

export type ReceiptSnapshot = {
  number: string;
  orderReference: string;
  issuedAt: string;
  customer: { name: string; email: string };
  currency: string;
  items: { description: string; quantity: number; unitPriceMinor: number; totalMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  payments: { method: string; reference: string; amountMinor: number }[];
  business: { name: string; legalName: string; address: string; email: string; footer: string };
};

/** Issues the order's receipt once (unique per order). Returns null if one already exists. */
export async function issueReceipt(t: Db, orderId: string): Promise<{ number: string; itemsSummary: string } | null> {
  const existing = await t.one("select 1 from invoices where order_id = $1", [orderId]);
  if (existing) return null;
  const order = await t.one<{
    reference: string; customer_name: string; email: string; currency: string; subtotal_minor: number;
    discount_minor: number; total_minor: number;
  }>("select * from orders where id = $1", [orderId]);
  if (!order) return null;
  const items = await t.query<{ description: string; quantity: number; unit_price_minor: number; total_minor: number }>(
    "select description, quantity, unit_price_minor, total_minor from order_items where order_id = $1 order by description",
    [orderId],
  );
  const payments = await t.query<{ provider: string; channel: string | null; provider_reference: string; amount_minor: number }>(
    "select provider, channel, provider_reference, amount_minor from payments where order_id = $1 and status = 'success'",
    [orderId],
  );
  const settings = await loadSettings(t);
  const seq = await t.one<{ n: number }>("select nextval('receipt_number_seq')::int as n");
  const number = `RCT-${new Date().getUTCFullYear()}-${String(seq!.n).padStart(6, "0")}`;
  const snapshot: ReceiptSnapshot = {
    number,
    orderReference: order.reference,
    issuedAt: new Date().toISOString(),
    customer: { name: order.customer_name, email: order.email },
    currency: order.currency,
    items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPriceMinor: i.unit_price_minor, totalMinor: i.total_minor })),
    subtotalMinor: order.subtotal_minor,
    discountMinor: order.discount_minor,
    totalMinor: order.total_minor,
    payments: payments.map((p) => ({ method: p.channel ? `${p.provider} (${p.channel})` : p.provider, reference: p.provider_reference, amountMinor: p.amount_minor })),
    business: {
      name: settings.brand.name,
      legalName: settings.business.legalName,
      address: [settings.contact.address, settings.contact.city, settings.contact.country].filter(Boolean).join(", "),
      email: settings.contact.email,
      footer: settings.business.receiptFooter,
    },
  };
  const inserted = await t.one<{ number: string }>(
    "insert into invoices (number, order_id, snapshot) values ($1, $2, $3) on conflict (order_id) do nothing returning number",
    [number, orderId, JSON.stringify(snapshot)],
  );
  if (!inserted) return null;
  return { number, itemsSummary: items.map((i) => `${i.quantity} × ${i.description}`).join(", ") };
}

export async function receiptForOrder(orderId: string): Promise<ReceiptSnapshot | null> {
  const row = await db.one<{ snapshot: ReceiptSnapshot }>("select snapshot from invoices where order_id = $1", [orderId]);
  return row?.snapshot ?? null;
}

export async function renderReceiptPdf(orderId: string): Promise<{ number: string; bytes: Uint8Array } | null> {
  const r = await receiptForOrder(orderId);
  if (!r) return null;
  const tz = (await loadSettings()).business.timezone;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.45, 0.45, 0.45);
  // pdf-lib standard fonts are WinAnsi; strip unsupported characters.
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "");
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color });

  text(r.business.name, 50, 18, bold);
  y -= 18;
  if (r.business.legalName) { text(r.business.legalName, 50, 9, font, grey); y -= 12; }
  if (r.business.address) { text(r.business.address, 50, 9, font, grey); y -= 12; }
  if (r.business.email) { text(r.business.email, 50, 9, font, grey); y -= 12; }
  y -= 20;
  text("RECEIPT", 50, 14, bold);
  y -= 22;
  text(`Receipt number: ${r.number}`, 50); y -= 14;
  text(`Order reference: ${r.orderReference}`, 50); y -= 14;
  text(`Issued: ${formatDateTime(r.issuedAt, tz)}`, 50); y -= 14;
  text(`Billed to: ${r.customer.name || r.customer.email} <${r.customer.email}>`, 50); y -= 30;

  text("Item", 50, 9, bold); text("Qty", 360, 9, bold); text("Unit", 400, 9, bold); text("Total", 480, 9, bold);
  y -= 8;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: grey });
  y -= 16;
  for (const i of r.items) {
    text(i.description.slice(0, 60), 50); text(String(i.quantity), 360);
    text(formatMoney(i.unitPriceMinor, r.currency, "en-GB"), 400); text(formatMoney(i.totalMinor, r.currency, "en-GB"), 480);
    y -= 16;
  }
  y -= 6;
  page.drawLine({ start: { x: 300, y }, end: { x: 545, y }, thickness: 0.5, color: grey });
  y -= 16;
  text("Subtotal", 400); text(formatMoney(r.subtotalMinor, r.currency, "en-GB"), 480); y -= 14;
  if (r.discountMinor) { text("Discount", 400); text(`-${formatMoney(r.discountMinor, r.currency, "en-GB")}`, 480); y -= 14; }
  text("Total paid", 400, 10, bold); text(formatMoney(r.totalMinor, r.currency, "en-GB"), 480, 10, bold); y -= 30;
  for (const p of r.payments) { text(`Paid via ${p.method} - ref ${p.reference}`, 50, 9, font, grey); y -= 12; }
  if (r.business.footer) { y -= 20; text(r.business.footer.slice(0, 110), 50, 8, font, grey); }
  return { number: r.number, bytes: await pdf.save() };
}
