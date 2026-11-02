// Montos de los correos: "S/ 1,234.56", "S/1,060.00", "S/50", "S/ 17.9", "$ 3.84", "$299.50", "GRATIS".
import type { CurrencyCode } from "@/lib/types";

export type Money = { amount: number; currency: CurrencyCode };

export function parseMoney(raw: string | null | undefined): Money | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^gratis$/i.test(s)) return { amount: 0, currency: "PEN" };
  const m = /(S\/|US\$|\$)\s*([\d,]+(?:\.\d{1,2})?)/.exec(s);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: m[1] === "S/" ? "PEN" : "USD" };
}

/** Tipo de cambio "S/ 3.4990" → 3.499 */
export function parseRate(raw: string | null | undefined): number | null {
  const m = raw ? /([\d]+\.\d+)/.exec(raw) : null;
  return m ? Number(m[1]) : null;
}

/** "91.89%" → 0.9189 */
export function parsePercent(raw: string | null | undefined): number | null {
  const m = raw ? /([\d.]+)\s*%/.exec(raw) : null;
  return m ? Number(m[1]) / 100 : null;
}
