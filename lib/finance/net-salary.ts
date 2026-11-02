// Neto de un mes normal (SPEC 9): bruto − AFP − impuesto anual / 12.
// Es un promedio: la retención real puede concentrarse en meses con utilidades.

import { afpDiscount, type AfpRates } from "./afp";
import { round2 } from "./money";

export function monthlyNet({
  monthlyGross,
  afpRates,
  annualTax,
}: {
  monthlyGross: number;
  afpRates: AfpRates;
  annualTax: number;
}): number {
  return round2(monthlyGross - afpDiscount(monthlyGross, afpRates) - annualTax / 12);
}
