// Utilidades (SPEC 9). No se les descuenta AFP, sí impuesto.

import { round2 } from "./money";

/**
 * Luz del Sur: N sueldos al año (4.5), proporcional a los días trabajados
 * en el año de las utilidades. Se pagan en abril del año siguiente.
 */
export function profitSharingByDays({
  monthlyGross,
  salaries,
  daysWorked,
  daysInYear,
}: {
  monthlyGross: number;
  salaries: number;
  daysWorked: number;
  daysInYear: number;
}): number {
  return round2((salaries * monthlyGross * daysWorked) / daysInYear);
}

/**
 * Proporcional a lo ganado en el año (Prima AFP: 3.5 sueldos al año):
 * salaries / 12 × suma de los sueldos mensuales ganados.
 */
export function profitSharingByEarnings({
  salaries,
  earnedInYear,
}: {
  salaries: number;
  earnedInYear: number;
}): number {
  return round2((salaries / 12) * earnedInYear);
}

/** Días trabajados en un año calendario (ambos extremos incluidos). */
export function daysWorkedInYear(
  year: number,
  startDate: string,
  endDate?: string | null,
): number {
  const from = maxIso(startDate, `${year}-01-01`);
  const to = minIso(endDate ?? `${year}-12-31`, `${year}-12-31`);
  if (to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

export function daysInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
}

const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);
