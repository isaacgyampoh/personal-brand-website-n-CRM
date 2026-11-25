import "server-only";
import { tx } from "@/lib/database/pool";
import { paymentGateway } from "@/features/payments/application/gateway";
import { PaymentsNotConfiguredError } from "@/features/payments/domain/gateway";
import { CheckoutError, completeFreeOrderIfZero, createOrder, holdMinutes, startPayment } from "./checkout";

export type PurchaseRequest = {
  type: "course" | "product";
  slug: string;
  buyer: { fullName: string; email: string; phone?: string; consentMarketing?: boolean };
  discountCode?: string;
  userId?: string | null;
  attribution?: Record<string, unknown>;
};

export type PurchaseOutcome = { kind: "fulfilled"; orderReference: string } | { kind: "payment"; orderReference: string; authorizationUrl: string };

/** Checkout for courses and digital products. Price is read from the database. */
export async function purchaseCatalogItem(req: PurchaseRequest): Promise<PurchaseOutcome> {
  const table = req.type === "course" ? "courses" : "products";
  const result = await tx(async (t) => {
    const item = await t.one<{ id: string; title: string; price_minor: number; currency: string; status: string; visibility?: string }>(
      `select * from ${table} where slug = $1`,
      [req.slug],
    );
    if (!item || item.status !== "published" || item.visibility === "private") throw new CheckoutError("This item isn't available.");
    if (item.price_minor > 0 && !req.discountCode && !paymentGateway()) throw new PaymentsNotConfiguredError();
    const { order } = await createOrder(t, {
      customer: { email: req.buyer.email, fullName: req.buyer.fullName, phone: req.buyer.phone, consentMarketing: req.buyer.consentMarketing, consentSource: `${req.type}:${req.slug}` },
      userId: req.userId,
      items: [{ itemType: req.type, itemId: item.id, description: item.title, quantity: 1, unitPriceMinor: item.price_minor, currency: item.currency }],
      discountCode: req.discountCode,
      attribution: req.attribution,
      expiresAt: new Date(Date.now() + (await holdMinutes()) * 60_000),
    });
    if (await completeFreeOrderIfZero(t, order)) return { kind: "fulfilled" as const, order };
    if (!paymentGateway()) throw new PaymentsNotConfiguredError();
    return { kind: "pending" as const, order };
  });
  if (result.kind === "fulfilled") return { kind: "fulfilled", orderReference: result.order.reference };
  const { authorizationUrl } = await startPayment(result.order.id);
  return { kind: "payment", orderReference: result.order.reference, authorizationUrl };
}
