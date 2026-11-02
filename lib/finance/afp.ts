// AFP (SPEC 9 y 9.3): Prima, comisión sobre flujo.
// A gratificaciones, utilidades y bono no se les descuenta AFP.

import { round2 } from "./money";

export type AfpRates = {
  /** Aporte obligatorio: lo único que va a tu fondo. */
  aporte: number;
  /** Prima de seguro. */
  seguro: number;
  /** Comisión sobre flujo. */
  comision: number;
};

/** Valores por defecto del SPEC; los reales viven en `settings`. */
export const DEFAULT_AFP_RATES: AfpRates = { aporte: 0.1, seguro: 0.0137, comision: 0.016 };

export function afpTotalRate(rates: AfpRates): number {
  return rates.aporte + rates.seguro + rates.comision;
}

/** Descuento mensual de AFP sobre el sueldo bruto (4,785 → 620.61). */
export function afpDiscount(monthlyGross: number, rates: AfpRates): number {
  return round2(monthlyGross * afpTotalRate(rates));
}

/** Parte del descuento que va al fondo (el activo "Fondo AFP"). */
export function afpFundContribution(monthlyGross: number, rates: AfpRates): number {
  return round2(monthlyGross * rates.aporte);
}
