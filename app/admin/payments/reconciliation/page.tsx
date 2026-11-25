import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { reconciliationReport } from "@/features/commerce/application/reconciliation";
import { loadSetting } from "@/features/settings/application/settings";
import { formatMoney } from "@/lib/money";
import { PageTitle, Stat, Table, Td, StatusBadge, Notice } from "@/components/dashboard/ui";

export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage() {
  await requireStaffPage("payments:view");
  const [{ issues, totals }, biz] = await Promise.all([reconciliationReport(), loadSetting("business")]);
  const m = (n: number) => formatMoney(n, biz.currency);
  return (
    <div className="space-y-6">
      <PageTitle title="Financial reconciliation" description="Live cross-check of orders, payments, the immutable ledger, refunds and receipts. Pending payments are re-verified automatically every 5 minutes." back={{ href: "/admin/payments", label: "Payments" }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ledger net" value={m(totals.ledgerNet)} />
        <Stat label="Orders net (paid − refunded)" value={m(totals.ordersNet)} hint={totals.ledgerNet === totals.ordersNet ? "matches ledger" : "differs from ledger"} />
        <Stat label="Successful payments" value={m(totals.paymentsSuccess)} />
        <Stat label="Refunds processed" value={m(totals.refundsProcessed)} />
      </div>
      {issues.length === 0 ? <Notice tone="green">Everything reconciles. No discrepancies found.</Notice> : (
        <Table head={["Severity", "Issue", "Order", "Detail"]}>
          {issues.map((i, k) => (
            <tr key={k}>
              <Td><StatusBadge status={i.severity} tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"} /></Td>
              <Td className="text-xs">{i.kind.replace(/_/g, " ")}</Td>
              <Td>{i.orderId ? <Link href={`/admin/payments/${i.orderId}`} className="font-mono text-xs underline">{i.reference}</Link> : <span className="font-mono text-xs">{i.reference}</span>}</Td>
              <Td className="text-sm">{i.detail}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
