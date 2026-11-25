import { requireUser } from "@/lib/auth/session";
import { myOrders } from "@/features/portal/application/portal";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Receipts" };

export default async function Orders() {
  const user = await requireUser("/portal/orders");
  const orders = await myOrders(user.id);
  return (
    <div className="space-y-8">
      <h1 className="display-lg">Payments & receipts</h1>
      {orders.length ? (
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
              <span><span className="block font-semibold">{o.items}</span><span className="text-sm text-[var(--muted-ink)]">{o.reference} · {o.created_at.toLocaleDateString("en-GB")} · <span className="capitalize">{o.status.replace("_", " ")}</span></span></span>
              <span className="flex items-center gap-5"><span className="font-semibold">{o.total_minor ? formatMoney(o.total_minor, o.currency) : "Free"}</span>{o.receipt && <a href={`/api/receipts/${o.id}`} className="btn btn-link !p-0">Receipt PDF</a>}{o.status === "failed" && <a href={`/checkout/retry/${o.reference}`} className="btn btn-link !p-0">Pay now</a>}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[var(--muted-ink)]">No payments yet.</p>}
    </div>
  );
}
