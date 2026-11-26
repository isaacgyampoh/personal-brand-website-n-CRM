import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { confirmManualRefundAction, manualPaymentAction, refundAction, resendReceiptAction, reverifyAction } from "@/features/commerce/presentation/admin-actions";
import { hasRecentAuth } from "@/lib/auth/reauth";
import { ReauthForm } from "@/components/dashboard/reauth-form";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { PageTitle, Panel, StatusBadge, Notice, Table, Td } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("payments:view");
  const { id } = await params;
  const o = await db.one<{ id: string; reference: string; status: string; email: string; customer_name: string; contact_id: string; currency: string; subtotal_minor: number; discount_minor: number; total_minor: number; refunded_minor: number; attention_reason: string | null; created_at: Date; paid_at: Date | null; fulfilled_at: Date | null; expires_at: Date | null; attribution: Record<string, unknown>; code: string | null; receipt: string | null }>(
    `select o.*, d.code, i.number as receipt from orders o left join discount_codes d on d.id = o.discount_code_id left join invoices i on i.order_id = o.id where o.id = $1`, [id]);
  if (!o) notFound();
  const tz = (await loadSetting("business")).timezone;
  const [items, payments, ledger, refunds] = await Promise.all([
    db.query<{ description: string; quantity: number; unit_price_minor: number; total_minor: number; item_type: string }>("select * from order_items where order_id = $1", [id]),
    db.query<{ id: string; provider: string; provider_reference: string; amount_minor: number; status: string; channel: string | null; gateway_response: string | null; created_at: Date; verified_at: Date | null; notes: string | null }>("select * from payments where order_id = $1 order by created_at", [id]),
    db.query<{ id: number; kind: string; amount_minor: number; memo: string; created_at: Date }>("select * from financial_ledger where order_id = $1 order by created_at", [id]),
    db.query<{ id: string; amount_minor: number; status: string; reason: string; created_at: Date; failure_reason: string | null }>("select * from refunds where order_id = $1 order by created_at", [id]),
  ]);
  const money = (m: number) => formatMoney(m, o.currency);
  const recent = await hasRecentAuth();
  const manualRefunds = refunds.filter((r) => r.status === "processing" && payments.some((p) => p.provider === "hubtel"));
  const refundable = o.total_minor - o.refunded_minor - refunds.filter((r) => ["pending", "processing"].includes(r.status)).reduce((s, r) => s + r.amount_minor, 0);
  return (
    <div className="space-y-6">
      <PageTitle title={`Order ${o.reference}`} description={`${o.customer_name || o.email} · created ${formatDateTime(o.created_at, tz)}`} back={{ href: "/admin/payments", label: "Payments" }} actions={<StatusBadge status={o.status} />} />
      {o.status === "needs_attention" && <Notice tone="red"><strong>Needs attention:</strong> {o.attention_reason}</Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Items">
            <ul className="divide-y text-sm">{items.map((i, k) => <li key={k} className="flex justify-between py-2"><span>{i.quantity} × {i.description}</span><span className="tabular-nums">{money(i.total_minor)}</span></li>)}</ul>
            <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal_minor)}</dd></div>
              {o.discount_minor > 0 && <div className="flex justify-between"><dt>Discount {o.code && `(${o.code})`}</dt><dd>−{money(o.discount_minor)}</dd></div>}
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(o.total_minor)}</dd></div>
              {o.refunded_minor > 0 && <div className="flex justify-between text-violet-700"><dt>Refunded</dt><dd>−{money(o.refunded_minor)}</dd></div>}
            </dl>
          </Panel>
          <Panel title="Payment attempts">
            {payments.length ? <Table head={["Reference", "Provider", "Amount", "Status", "Verified", ""]}>{payments.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.provider_reference}</Td>
                <Td className="capitalize">{p.provider}{p.channel ? ` · ${p.channel}` : ""}{p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}</Td>
                <Td>{money(p.amount_minor)}</Td>
                <Td><StatusBadge status={p.status} />{p.gateway_response && <div className="text-xs text-muted-foreground">{p.gateway_response}</div>}</Td>
                <Td className="text-xs">{p.verified_at ? formatDateTime(p.verified_at, tz) : "—"}</Td>
                <Td>{(p.provider === "paystack" || p.provider === "hubtel") && p.status !== "success" && <ActionButton action={reverifyAction} fields={{ reference: p.provider_reference }} label="Verify now" success={`Checked with ${p.provider === "hubtel" ? "Hubtel" : "Paystack"}`} />}</Td>
              </tr>
            ))}</Table> : <p className="text-sm text-muted-foreground">No payment attempts.</p>}
          </Panel>
          <Panel title="Ledger (immutable)">
            {ledger.length ? <ul className="divide-y text-sm">{ledger.map((l) => <li key={l.id} className="flex justify-between py-2"><span><StatusBadge status={l.kind} tone={l.amount_minor < 0 ? "violet" : "green"} /> <span className="ml-1 text-muted-foreground">{l.memo} · {formatDateTime(l.created_at, tz)}</span></span><span className="tabular-nums">{money(l.amount_minor)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No ledger entries.</p>}
          </Panel>
          {refunds.length > 0 && <Panel title="Refunds"><ul className="divide-y text-sm">{refunds.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.reason}<span className="block text-xs text-muted-foreground">{formatDateTime(r.created_at, tz)}{r.failure_reason ? ` · ${r.failure_reason}` : ""}</span></span><span className="text-right">{money(r.amount_minor)}<br /><StatusBadge status={r.status} /></span></li>)}</ul></Panel>}
        </div>
        <div className="space-y-6">
          <Panel title="Customer"><p className="text-sm"><Link className="font-medium underline" href={`/admin/crm/${o.contact_id}`}>{o.customer_name || o.email}</Link><br />{o.email}</p>
            {o.receipt && <div className="mt-3 flex flex-wrap gap-2 text-sm"><a className="underline" href={`/api/receipts/${o.id}`}>Receipt {o.receipt} (PDF)</a><ActionButton action={resendReceiptAction} fields={{ orderId: o.id }} label="Resend" success="Receipt queued" /></div>}
            {Object.keys(o.attribution).length > 0 && <p className="mt-3 text-xs text-muted-foreground">Source: {[o.attribution.utm_source, o.attribution.utm_campaign].filter(Boolean).join(" / ")}</p>}
          </Panel>
          {!recent && (user.permissions.has("payments:refund") || user.permissions.has("payments:record")) && <ReauthForm mfa={user.mfaEnabled} />}
          {user.permissions.has("payments:refund") && manualRefunds.map((r) => (
            <Panel key={r.id} title="Confirm Hubtel refund" description={`Refund ${money(r.amount_minor)} in the Hubtel merchant dashboard first, then confirm here. Access is revoked only after confirmation.`}>
              <ActionForm action={confirmManualRefundAction} success="Refund confirmed" confirm="Confirm the money has been returned to the customer?" className="space-y-3">
                <input type="hidden" name="refundId" value={r.id} />
                <Field label="Hubtel refund reference / note" name="note" required />
                <Submit variant="destructive">Confirm refund processed</Submit>
              </ActionForm>
            </Panel>
          ))}
          {user.permissions.has("payments:record") && ["pending", "failed", "expired", "needs_attention"].includes(o.status) && (
            <Panel title="Record offline payment" description="Bank transfer, MoMo to business line or cash. Recorded in the audit log.">
              <ActionForm action={manualPaymentAction} success="Payment recorded — order fulfilled" confirm="Confirm you have received this money?" className="space-y-3">
                <input type="hidden" name="orderId" value={o.id} />
                <Field label={`Amount (${o.currency})`} name="amount" defaultValue={minorToMajorString(o.total_minor, o.currency)} />
                <Select label="Method" name="method" options={[["bank_transfer", "Bank transfer"], ["mobile_money", "Mobile Money"], ["cash", "Cash"], ["other", "Other"]] as const} />
                <Field label="Reference / note" name="note" required />
                <Submit>Record payment</Submit>
              </ActionForm>
            </Panel>
          )}
          {user.permissions.has("payments:refund") && refundable > 0 && ["paid", "partially_refunded", "needs_attention"].includes(o.status) && (
            <Panel title="Refund" description={`Up to ${money(refundable)}. A full refund revokes course/product access and cancels registrations.`}>
              <ActionForm action={refundAction} success="Refund initiated" confirm="Issue this refund?" className="space-y-3">
                <input type="hidden" name="orderId" value={o.id} />
                <Field label={`Amount (${o.currency})`} name="amount" defaultValue={minorToMajorString(refundable, o.currency)} />
                <Field label="Reason" name="reason" required />
                <Submit variant="destructive">Refund</Submit>
              </ActionForm>
            </Panel>
          )}
          <Panel title="Timeline"><dl className="space-y-1 text-xs">
            <div className="flex justify-between"><dt>Created</dt><dd>{formatDateTime(o.created_at, tz)}</dd></div>
            {o.expires_at && <div className="flex justify-between"><dt>Hold expires</dt><dd>{formatDateTime(o.expires_at, tz)}</dd></div>}
            {o.paid_at && <div className="flex justify-between"><dt>Paid</dt><dd>{formatDateTime(o.paid_at, tz)}</dd></div>}
            {o.fulfilled_at && <div className="flex justify-between"><dt>Fulfilled</dt><dd>{formatDateTime(o.fulfilled_at, tz)}</dd></div>}
          </dl></Panel>
        </div>
      </div>
    </div>
  );
}
