// Deudas (SPEC 11): costo de las cuotas y prepago.
import { round2 } from "./money";

/** Tasa mensual equivalente a una tasa efectiva anual (TCEA/TEA). */
export function monthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/**
 * Cuánto cuesta prepagar hoy `remaining` cuotas de `installment` a la tasa anual `annual`
 * (valor presente; la próxima cuota vence en un mes) y cuánto interés te ahorras.
 */
export function prepayment(remaining: number, installment: number, annual: number) {
  const r = monthlyRate(annual);
  const payoff = r > 0 ? installment * ((1 - Math.pow(1 + r, -remaining)) / r) : installment * remaining;
  const total = installment * remaining;
  return { payoff: round2(payoff), totalIfNotPrepaid: round2(total), interestSaved: round2(total - payoff) };
}
