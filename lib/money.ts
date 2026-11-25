/** Money helpers. All amounts are integer minor units (e.g. pesewas). */

const MINOR_DIGITS: Record<string, number> = { GHS: 2, NGN: 2, USD: 2, ZAR: 2, KES: 2, EUR: 2, GBP: 2 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-GH"): string {
  const digits = minorDigits(currency);
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(major) ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(digits)}`;
  }
}

/** Parse a user-entered major amount ("1,250.50") into minor units. */
export function parseMajorToMinor(input: string | number, currency = "GHS"): number {
  const digits = minorDigits(currency);
  const cleaned = typeof input === "number" ? input.toString() : input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error("Invalid amount");
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > digits) throw new Error(`At most ${digits} decimal places`);
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
}

export function minorToMajorString(minor: number, currency = "GHS"): string {
  const digits = minorDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export type DiscountRule = { kind: "percent" | "fixed"; value: number; currency?: string | null };

/** Discount amount in minor units, never exceeding the subtotal. Percent rounds down (customer-favourable rounding is applied to the total). */
export function computeDiscount(subtotalMinor: number, rule: DiscountRule, currency: string): number {
  if (subtotalMinor <= 0) return 0;
  if (rule.kind === "percent") {
    return Math.min(subtotalMinor, Math.round((subtotalMinor * rule.value) / 100));
  }
  if (rule.currency && rule.currency.toUpperCase() !== currency.toUpperCase()) return 0;
  return Math.min(subtotalMinor, rule.value);
}
