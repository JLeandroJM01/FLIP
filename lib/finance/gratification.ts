// Gratificación de julio y diciembre (SPEC 9).
// Base = sueldo × días base / 30 (35 días en Luz del Sur), más la bonificación
// extraordinaria (6.75% por tener EPS), proporcional a los meses completos del semestre.

import { round2 } from "./money";

export type GratificationInput = {
  monthlyGross: number;
  /** `income_profile.grat_days_base` (35). */
  daysBase: number;
  /** Bonificación extraordinaria sobre la base (0.0675 con EPS). */
  bonusRate: number;
  /** Meses completos trabajados en el semestre (0–6). */
  completeMonths: number;
};

export function gratification({
  monthlyGross,
  daysBase,
  bonusRate,
  completeMonths,
}: GratificationInput): number {
  const months = Math.min(Math.max(completeMonths, 0), 6);
  const base = (monthlyGross * daysBase) / 30;
  return round2((base * (1 + bonusRate) * months) / 6);
}

/**
 * Meses calendario completos trabajados en el semestre que paga la gratificación:
 * enero–junio para la de julio, julio–diciembre para la de diciembre.
 * Un mes cuenta si se trabajó desde su primer hasta su último día.
 */
export function gratificationCompleteMonths(
  payMonth: 7 | 12,
  year: number,
  startDate: string,
  endDate?: string | null,
): number {
  const firstMonth = payMonth === 7 ? 1 : 7;
  let count = 0;
  for (let m = firstMonth; m < firstMonth + 6; m++) {
    const monthStart = isoDate(year, m, 1);
    const monthEnd = isoDate(year, m, daysInMonth(year, m));
    if (startDate <= monthStart && (!endDate || endDate >= monthEnd)) count++;
  }
  return count;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
