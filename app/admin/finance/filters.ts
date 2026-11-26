import { resolveRange } from "@/features/analytics/application/range";
import type { FinanceFilter } from "@/features/finance/application/finance";

export type FinanceSearch = { range?: string; from?: string; to?: string; currency?: string; provider?: string; status?: string; type?: string; q?: string; page?: string };

export function financeFilter(sp: FinanceSearch, tz: string, defaultCurrency: string): { filter: FinanceFilter; label: string; key: string } {
  const r = resolveRange(sp, tz);
  const currency = /^[A-Z]{3}$/.test(sp.currency ?? "") ? sp.currency! : defaultCurrency;
  return { filter: { from: r.from, to: r.to, currency, provider: sp.provider || undefined, status: sp.status || undefined, itemType: sp.type || undefined, q: sp.q?.trim() || undefined }, label: r.label, key: r.key };
}

export function financeQuery(sp: FinanceSearch, extra: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  for (const k of ["range", "from", "to", "currency", "provider", "status", "type", "q"] as const) if (sp[k]) out.set(k, sp[k]!);
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  return out.toString();
}
