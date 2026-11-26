"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { assertRecentAuth } from "@/lib/auth/reauth";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { parseMajorToMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { confirmManualRefund, requestRefund } from "../application/refunds";
import { recordManualPayment, verifyAndApply } from "../application/fulfilment";
import { enqueueEmail } from "@/features/notifications/application/send";
import { env } from "@/lib/config/env";
import { formatMoney } from "@/lib/money";

export async function refundAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("payments:refund");
    await assertRecentAuth();
    const orderId = z.string().uuid().parse(fd.get("orderId"));
    const o = await db.one<{ currency: string }>("select currency from orders where id = $1", [orderId]);
    if (!o) throw new UserError("Order not found.");
    const amount = parseMajorToMinor(String(fd.get("amount") ?? ""), o.currency);
    await requestRefund({ orderId, amountMinor: amount, reason: z.string().trim().min(3, "Give a reason").max(500).parse(fd.get("reason")), actorId: u.id });
    return undefined;
  });
}

export async function manualPaymentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("payments:record");
    await assertRecentAuth();
    const orderId = z.string().uuid().parse(fd.get("orderId"));
    const o = await db.one<{ currency: string }>("select currency from orders where id = $1", [orderId]);
    if (!o) throw new UserError("Order not found.");
    await recordManualPayment({
      orderId, amountMinor: parseMajorToMinor(String(fd.get("amount") ?? ""), o.currency),
      method: z.enum(["cash", "bank_transfer", "mobile_money", "other"]).parse(fd.get("method")),
      note: z.string().trim().min(3, "Add a reference or note").max(300).parse(fd.get("note")), actorId: u.id,
    });
    return undefined;
  });
}

export async function reverifyAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("payments:view");
    const ref = z.string().max(80).parse(fd.get("reference"));
    const r = await verifyAndApply(ref);
    await audit({ actorId: u.id, action: "payment.reverify", entityType: "payment", entityId: ref, data: r });
    return undefined;
  });
}

export async function resendReceiptAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("payments:view");
    const orderId = z.string().uuid().parse(fd.get("orderId"));
    const o = await db.one<{ email: string; customer_name: string; reference: string; total_minor: number; currency: string; number: string | null }>(
      "select o.*, i.number from orders o left join invoices i on i.order_id = o.id where o.id = $1", [orderId]);
    if (!o?.number) throw new UserError("This order has no receipt.");
    await enqueueEmail({
      to: o.email, template: "payment_receipt",
      data: { name: o.customer_name || "there", total: formatMoney(o.total_minor, o.currency), receiptNumber: o.number, reference: o.reference, items: "", receiptUrl: `${env().APP_URL}/portal/orders/${o.reference}` },
      idempotencyKey: `receipt-resend:${orderId}:${Date.now()}`,
      attachments: [{ kind: "receipt", orderId }],
    });
    await audit({ actorId: u.id, action: "receipt.resend", entityType: "order", entityId: orderId });
    return undefined;
  });
}

/** Staff confirms a refund completed in a provider dashboard (Hubtel has no refund API). */
export async function confirmManualRefundAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("payments:refund");
    await assertRecentAuth();
    await confirmManualRefund(z.string().uuid().parse(fd.get("refundId")), u.id, z.string().trim().min(3, "Add the provider refund reference").max(300).parse(fd.get("note")));
    return undefined;
  });
}
