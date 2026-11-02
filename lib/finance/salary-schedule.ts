// Pagos del sueldo por día (SPEC 9 y 9.5). Con pay_schedule [{día 20, 50%}, {día 5, 50%, mes siguiente}]:
//   - el 20 es el adelanto del mes: share × bruto, sin descuentos;
//   - el 5 es el resto del mes anterior: lo ganado − adelantos − AFP − impuesto del mes.
// Si no hay pago "del mes siguiente" (pago único), cada pago es share × (ganado − AFP − impuesto).
// Un mes incompleto (el de ingreso) se paga proporcional: bruto × días/30, sin adelanto.

import { afpTotalRate, type AfpRates } from "./afp";
import { round2 } from "./money";

export type PayItem = { day: number; share: number; month_offset?: number };

export type SalaryProfile = {
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  monthlyGross: number;
  paySchedule: PayItem[];
  afpRates: AfpRates;
};

export type SalaryPayment = {
  date: string; // YYYY-MM-DD (hora de Lima)
  covers: string; // YYYY-MM del mes que se paga
  part: "adelanto" | "resto" | "parcial" | "unico";
  amount: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Días trabajados en el mes (convención de 30 días para un mes completo). */
function worked(profile: SalaryProfile, y: number, m: number): { full: boolean; days: number } {
  const first = iso(y, m, 1);
  const last = iso(y, m, daysIn(y, m));
  const from = profile.startDate > first ? profile.startDate : first;
  const to = profile.endDate && profile.endDate < last ? profile.endDate : last;
  if (to < from) return { full: false, days: 0 };
  const full = from === first && to === last;
  const days = full ? 30 : Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return { full, days };
}

/**
 * Pagos que caen en `date`. `monthlyTax(YYYY-MM)` = impuesto de quinta estimado del mes
 * (settings.monthly_tax_estimate); `realAmount(part)` = último monto real corregido por el
 * usuario para ese tipo de pago (la primera boleta ajusta los siguientes, SPEC 9.1).
 */
export function salaryPaymentsOn(
  date: string,
  profile: SalaryProfile,
  monthlyTax: (ym: string) => number,
  realAmount: (part: SalaryPayment["part"]) => number | null = () => null,
): SalaryPayment[] {
  const [y, m, d] = date.split("-").map(Number);
  const hasDeferred = profile.paySchedule.some((p) => (p.month_offset ?? 0) > 0);
  const advanceShare = profile.paySchedule.filter((p) => !(p.month_offset ?? 0)).reduce((s, p) => s + p.share, 0);
  const payments: SalaryPayment[] = [];

  for (const item of profile.paySchedule) {
    if (item.day !== d) continue;
    const offset = item.month_offset ?? 0;
    const cy = m - offset < 1 ? y - 1 : y;
    const cm = ((m - offset - 1 + 12) % 12) + 1;
    const covers = `${cy}-${pad(cm)}`;
    const { full, days } = worked(profile, cy, cm);
    if (days === 0) continue;

    const earned = full ? profile.monthlyGross : (profile.monthlyGross * days) / 30;
    const deductions = round2(earned * afpTotalRate(profile.afpRates)) + monthlyTax(covers);

    if (hasDeferred && offset === 0) {
      if (!full || date < profile.startDate) continue; // en el mes de ingreso no hay adelanto
      payments.push({ date, covers, part: "adelanto", amount: realAmount("adelanto") ?? round2(item.share * profile.monthlyGross) });
    } else if (hasDeferred) {
      if (!full) {
        payments.push({ date, covers, part: "parcial", amount: round2(earned - deductions) });
      } else {
        const rest = round2(earned - advanceShare * profile.monthlyGross - deductions);
        payments.push({ date, covers, part: "resto", amount: realAmount("resto") ?? rest });
      }
    } else {
      if (date < profile.startDate) continue;
      payments.push({ date, covers, part: "unico", amount: realAmount("unico") ?? round2(item.share * (earned - deductions)) });
    }
  }
  return payments;
}
