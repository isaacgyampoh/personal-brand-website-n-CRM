import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { loadSetting } from "@/features/settings/application/settings";
import { exportTransactions } from "@/features/finance/application/finance";
import { financeFilter, type FinanceSearch } from "@/app/admin/finance/filters";

export const dynamic = "force-dynamic";

/** Filtered transactions as CSV or Excel. Same filters as the Finance page. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("finance:export")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams) as FinanceSearch & { format?: string };
  const biz = await loadSetting("business");
  const { filter } = financeFilter(sp, biz.timezone, biz.currency);
  const format = sp.format === "xlsx" ? "xlsx" : "csv";
  const { body, count } = await exportTransactions(filter, format);
  await audit({ actorId: user.id, action: "finance.export_transactions", entityType: "order", data: { count, format, currency: filter.currency, provider: filter.provider ?? null, status: filter.status ?? null } });
  const name = `transactions-${filter.currency}-${new Date().toISOString().slice(0, 10)}.${format}`;
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
