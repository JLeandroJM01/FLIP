// Impuesto a la renta de quinta categoría (SPEC 9.2).
// Renta neta anual = bruto anual − 7 UIT, con tramos progresivos en UIT.

import { round2 } from "./money";

export type TaxBracket = { upToUit: number; rate: number };

export const TAX_BRACKETS: TaxBracket[] = [
  { upToUit: 5, rate: 0.08 },
  { upToUit: 20, rate: 0.14 },
  { upToUit: 35, rate: 0.17 },
  { upToUit: 45, rate: 0.2 },
  { upToUit: Infinity, rate: 0.3 },
];

export const DEDUCTION_UIT = 7;

/**
 * Impuesto anual. `annualGross` incluye todo lo afecto del año: sueldos,
 * gratificaciones, utilidades, bonos y los ingresos de otros empleadores
 * del mismo año (SPEC 9.1). La CTS no entra.
 */
export function annualIncomeTax(annualGross: number, uit: number): number {
  const netIncome = Math.max(0, annualGross - DEDUCTION_UIT * uit);
  let tax = 0;
  let lower = 0;
  for (const { upToUit, rate } of TAX_BRACKETS) {
    const upper = upToUit * uit;
    if (netIncome <= lower) break;
    tax += (Math.min(netIncome, upper) - lower) * rate;
    lower = upper;
  }
  return round2(tax);
}
