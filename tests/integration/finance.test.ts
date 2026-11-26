import { afterAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { db, closePool } from "@/lib/database/pool";
import { registerForEvent } from "@/features/events/application/registration";
import { recordManualPayment, verifyAndApply } from "@/features/commerce/application/fulfilment";
import { requestRefund, submitRefund, markRefundProcessed } from "@/features/commerce/application/refunds";
import { setPaymentGatewayForTests } from "@/features/payments/application/gateway";
import { exportTransactions, financeSummary, transactions } from "@/features/finance/application/finance";
import { tx } from "@/lib/database/pool";
import { fakeGateway, makeEvent, resetData } from "../helpers";

afterAll(() => closePool());
let fake: ReturnType<typeof fakeGateway>;
let actor: string;
beforeEach(async () => {
  await resetData();
  fake = fakeGateway();
  setPaymentGatewayForTests(fake.gw);
  actor = (await db.one<{ id: string }>("insert into users (email, role) values ('fin@example.com','owner') on conflict (email) do update set role='owner' returning id"))!.id;
});

const range = () => ({ from: new Date(Date.now() - 86400_000), to: new Date(Date.now() + 86400_000), currency: "GHS" });

async function order(name: string, price: number) {
  const e = await makeEvent({ capacity: 10, price });
  await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: { fullName: name, email: `${name.toLowerCase()}@example.com` }, attendees: [{ fullName: name, email: `${name.toLowerCase()}@example.com` }] });
  return db.one<{ provider_reference: string; order_id: string }>("select provider_reference, order_id from payments order by created_at desc limit 1");
}

describe("finance reporting", () => {
  it("reports received, refunded, net and pending from the ledger", async () => {
    const a = await order("Ama", 20000);
    fake.succeed(a!.provider_reference);
    await verifyAndApply(a!.provider_reference);
    const b = await order("Kojo", 15000); // stays pending
    const c = await order("Esi", 10000);
    await db.query("update payments set status = 'abandoned' where provider_reference = $1", [c!.provider_reference]);
    await recordManualPayment({ orderId: c!.order_id, amountMinor: 10000, method: "bank_transfer", note: "GCB transfer 123", actorId: actor });
    const refundId = await requestRefund({ orderId: a!.order_id, amountMinor: 5000, reason: "partial", actorId: actor });
    await submitRefund(refundId!);
    const rf = await db.one<{ provider_refund_id: string }>("select provider_refund_id from refunds where id = $1", [refundId]);
    await tx((t) => markRefundProcessed(t, refundId!, rf!.provider_refund_id));

    const s = await financeSummary(range());
    expect(s.received).toBe(30000);
    expect(s.manual).toBe(10000);
    expect(s.refunded).toBe(5000);
    expect(s.net).toBe(25000);
    expect(s.pending).toEqual({ count: 1, total: 15000 });
    expect(s.byProvider.find((p) => p.provider === "manual")!.received).toBe(10000);
    expect(s.byItem.reduce((x, r) => x + r.net, 0)).toBe(25000);
    void b;

    // Filters: provider and search
    expect((await transactions({ ...range(), provider: "manual" }, { limit: 50, offset: 0 })).map((r) => r.customer)).toEqual(["Esi"]);
    expect((await transactions({ ...range(), q: "kojo@" }, { limit: 50, offset: 0 })).length).toBe(1);
    expect((await transactions({ ...range(), currency: "USD" }, { limit: 50, offset: 0 })).length).toBe(0);
  });

  it("exports CSV (formula-safe) and a real XLSX workbook", async () => {
    const a = await order("Ama", 20000);
    await db.query("update orders set customer_name = '=HYPERLINK(\"http://evil\")' where id = $1", [a!.order_id]);
    const csv = await exportTransactions(range(), "csv");
    expect(String(csv.body)).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const xlsx = await exportTransactions(range(), "xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(xlsx.body as Buffer).buffer as ArrayBuffer);
    const ws = wb.getWorksheet("Transactions")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Order");
    const nameCell = ws.getRow(2).getCell(5);
    expect(nameCell.formula).toBeUndefined();
    expect(nameCell.value).toBe('=HYPERLINK("http://evil")');
    expect(ws.getRow(2).getCell(11).value).toBe(200);
  });
});
