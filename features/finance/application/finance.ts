import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/lib/database/pool";
import { toCsv } from "@/lib/csv";

/**
 * Finance reporting. Money figures come from the immutable financial ledger
 * (what was actually received/refunded), never from order intent. Every
 * figure is filtered by currency because amounts in different currencies
 * cannot be added together.
 */
export type FinanceFilter = {
  from: Date; to: Date; currency: string;
  provider?: string; status?: string; itemType?: string; q?: string;
};

export const PROVIDERS = ["paystack", "hubtel", "manual"] as const;
export const ITEM_TYPES = [["appointment", "Coaching & services"], ["event_ticket", "Masterclasses & events"], ["course", "Courses"], ["product", "Digital products"]] as const;
export const ORDER_STATUSES = ["paid", "pending", "failed", "expired", "refunded", "partially_refunded", "needs_attention", "cancelled"] as const;

export async function financeSummary(f: FinanceFilter) {
  const p = [f.from, f.to, f.currency];
  const [ledger, pending, failed, attention, refundsOpen, byProvider, byType, byItem, daily] = await Promise.all([
    db.one<{ received: number; refunded: number; manual: number; count: number }>(
      `select coalesce(sum(amount_minor) filter (where kind in ('payment','manual_payment')),0)::bigint as received,
              coalesce(-sum(amount_minor) filter (where kind = 'refund'),0)::bigint as refunded,
              coalesce(sum(amount_minor) filter (where kind = 'manual_payment'),0)::bigint as manual,
              count(*) filter (where kind in ('payment','manual_payment'))::int as count
         from financial_ledger where created_at >= $1 and created_at < $2 and currency = $3`, p),
    db.one<{ n: number; total: number }>(
      `select count(*)::int as n, coalesce(sum(total_minor),0)::bigint as total from orders
        where status = 'pending' and total_minor > 0 and currency = $3 and created_at >= $1 and created_at < $2`, p),
    db.one<{ n: number }>(`select count(*)::int as n from payments where status in ('failed','abandoned') and currency = $3 and created_at >= $1 and created_at < $2`, p),
    db.one<{ n: number; total: number }>(`select count(*)::int as n, coalesce(sum(total_minor),0)::bigint as total from orders where status = 'needs_attention' and currency = $1`, [f.currency]),
    db.one<{ n: number; total: number }>(`select count(*)::int as n, coalesce(sum(amount_minor),0)::bigint as total from refunds where status in ('pending','processing') and currency = $1`, [f.currency]),
    db.query<{ provider: string; received: number; refunded: number }>(
      `select coalesce(p.provider, 'manual') as provider,
              coalesce(sum(l.amount_minor) filter (where l.kind in ('payment','manual_payment')),0)::bigint as received,
              coalesce(-sum(l.amount_minor) filter (where l.kind = 'refund'),0)::bigint as refunded
         from financial_ledger l left join payments p on p.id = l.payment_id
        where l.created_at >= $1 and l.created_at < $2 and l.currency = $3 group by 1 order by 2 desc`, p),
    db.query<{ item_type: string; gross: number; orders: number }>(
      `select i.item_type, sum(i.total_minor)::bigint as gross, count(distinct o.id)::int as orders
         from order_items i join orders o on o.id = i.order_id
        where o.paid_at >= $1 and o.paid_at < $2 and o.currency = $3 and o.status in ('paid','partially_refunded','refunded','needs_attention')
        group by 1 order by 2 desc`, p),
    db.query<{ item_type: string; description: string; gross: number; refunded: number; qty: number }>(
      `select i.item_type, i.description, sum(i.total_minor)::bigint as gross,
              -- refunds are allocated to items in proportion to their share of the order total
              round(sum(case when o.total_minor > 0 then o.refunded_minor::numeric * i.total_minor / o.total_minor else 0 end))::bigint as refunded,
              sum(i.quantity)::int as qty
         from order_items i join orders o on o.id = i.order_id
        where o.paid_at >= $1 and o.paid_at < $2 and o.currency = $3 and o.status in ('paid','partially_refunded','refunded','needs_attention')
        group by 1, 2 order by 3 desc limit 25`, p),
    db.query<{ day: string; received: number; refunded: number }>(
      `select to_char(created_at at time zone 'Africa/Accra', 'YYYY-MM-DD') as day,
              coalesce(sum(amount_minor) filter (where kind in ('payment','manual_payment')),0)::bigint as received,
              coalesce(-sum(amount_minor) filter (where kind = 'refund'),0)::bigint as refunded
         from financial_ledger where created_at >= $1 and created_at < $2 and currency = $3 group by 1 order by 1`, p),
  ]);
  return {
    received: Number(ledger?.received ?? 0), refunded: Number(ledger?.refunded ?? 0), manual: Number(ledger?.manual ?? 0),
    net: Number(ledger?.received ?? 0) - Number(ledger?.refunded ?? 0), payments: ledger?.count ?? 0,
    pending: { count: pending?.n ?? 0, total: Number(pending?.total ?? 0) }, failedPayments: failed?.n ?? 0,
    attention: { count: attention?.n ?? 0, total: Number(attention?.total ?? 0) }, refundsOpen: { count: refundsOpen?.n ?? 0, total: Number(refundsOpen?.total ?? 0) },
    byProvider: byProvider.map((r) => ({ ...r, received: Number(r.received), refunded: Number(r.refunded) })),
    byType: byType.map((r) => ({ ...r, gross: Number(r.gross) })),
    byItem: byItem.map((r) => ({ ...r, gross: Number(r.gross), refunded: Number(r.refunded), net: Number(r.gross) - Number(r.refunded) })),
    daily: daily.map((d) => ({ day: d.day, received: Number(d.received), refunded: Number(d.refunded) })),
  };
}

export type TransactionRow = {
  id: string; reference: string; created_at: Date; paid_at: Date | null; status: string; customer: string; email: string;
  currency: string; total_minor: number; refunded_minor: number; providers: string | null; items: string; item_types: string | null; receipt: string | null;
  utm_source: string | null; utm_campaign: string | null;
};

function transactionWhere(f: FinanceFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.from, f.to, f.currency];
  const w = ["o.created_at >= $1", "o.created_at < $2", "o.currency = $3"];
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) { params.push(f.status); w.push(`o.status = $${params.length}`); }
  if (f.provider && (PROVIDERS as readonly string[]).includes(f.provider)) { params.push(f.provider); w.push(`exists (select 1 from payments p where p.order_id = o.id and p.provider = $${params.length})`); }
  if (f.itemType && ITEM_TYPES.some(([k]) => k === f.itemType)) { params.push(f.itemType); w.push(`exists (select 1 from order_items i where i.order_id = o.id and i.item_type = $${params.length})`); }
  if (f.q) { params.push(`%${f.q.slice(0, 100)}%`); w.push(`(o.reference ilike $${params.length} or o.email::text ilike $${params.length} or o.customer_name ilike $${params.length} or exists (select 1 from payments p where p.order_id = o.id and p.provider_reference ilike $${params.length}))`); }
  return { sql: w.join(" and "), params };
}

export async function transactions(f: FinanceFilter, opts: { limit: number; offset: number }): Promise<TransactionRow[]> {
  const { sql, params } = transactionWhere(f);
  return db.query<TransactionRow>(
    `select o.id, o.reference, o.created_at, o.paid_at, o.status, coalesce(nullif(o.customer_name,''), o.email::text) as customer, o.email::text as email,
            o.currency, o.total_minor, o.refunded_minor, i2.number as receipt,
            (select string_agg(distinct p.provider, ', ') from payments p where p.order_id = o.id and p.status = 'success') as providers,
            (select string_agg(description, '; ') from order_items i where i.order_id = o.id) as items,
            (select string_agg(distinct item_type, ', ') from order_items i where i.order_id = o.id) as item_types,
            o.attribution->>'utm_source' as utm_source, o.attribution->>'utm_campaign' as utm_campaign
       from orders o left join invoices i2 on i2.order_id = o.id
      where ${sql} order by o.created_at desc limit ${Math.min(opts.limit, 100000)} offset ${Math.max(0, opts.offset)}`,
    params,
  );
}

const COLUMNS: [keyof TransactionRow | "net", string][] = [
  ["reference", "Order"], ["created_at", "Created"], ["paid_at", "Paid"], ["status", "Status"], ["customer", "Customer"], ["email", "Email"],
  ["items", "Items"], ["item_types", "Type"], ["providers", "Provider"], ["currency", "Currency"], ["total_minor", "Total"], ["refunded_minor", "Refunded"],
  ["net", "Net"], ["receipt", "Receipt"], ["utm_source", "Source"], ["utm_campaign", "Campaign"],
];
const major = (m: number) => Number((Number(m) / 100).toFixed(2));
const cell = (r: TransactionRow, k: keyof TransactionRow | "net") =>
  k === "net" ? major(r.total_minor - r.refunded_minor) : k === "total_minor" || k === "refunded_minor" ? major(r[k] as number) : r[k];

export async function exportTransactions(f: FinanceFilter, format: "csv" | "xlsx"): Promise<{ body: Buffer | string; count: number }> {
  const rows = await transactions(f, { limit: 100000, offset: 0 });
  if (format === "csv") return { body: toCsv(COLUMNS.map(([, h]) => h), rows.map((r) => COLUMNS.map(([k]) => cell(r, k)))), count: rows.length };
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map(([k, h]) => ({ header: h, key: String(k), width: k === "items" ? 40 : k === "email" || k === "customer" ? 26 : 14 }));
  for (const r of rows) {
    // Values are written as plain cell values (never formulas), so spreadsheet formula injection is not possible.
    ws.addRow(Object.fromEntries(COLUMNS.map(([k]) => [String(k), cell(r, k) ?? ""])));
  }
  for (const k of ["total_minor", "refunded_minor", "net"]) ws.getColumn(k).numFmt = "#,##0.00";
  for (const k of ["created_at", "paid_at"]) ws.getColumn(k).numFmt = "yyyy-mm-dd hh:mm";
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };
  return { body: Buffer.from(await wb.xlsx.writeBuffer()), count: rows.length };
}
