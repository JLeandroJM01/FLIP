// Arma la entrada de la proyección desde datos planos (sirve en el servidor y en el navegador,
// para el simulador "¿qué pasa si gasto S/ X al mes?").
import { prepayment } from "./debts";
import { incomeEventsInMonth, type IncomeCalendar, type IncomeEstimates, type IncomeProfileLite } from "./income-calendar";
import { round2 } from "./money";
import type { ProjectionDebt, ProjectionInput } from "./projection";
import { salaryPaymentsOn, type SalaryProfile } from "./salary-schedule";
import { monthlyTaxFor } from "./tax-table";

export type ProjectionContext = {
  today: string; // YYYY-MM-DD (Lima)
  endYm: string; // "2029-11"
  startCash: number;
  salary: SalaryProfile;
  income: IncomeProfileLite;
  taxTable: Record<string, number>;
  calendar: IncomeCalendar;
  estimates: IncomeEstimates;
  bonusMaxSalaries: number;
  debts: {
    name: string;
    order: number | null;
    balancePen: number;
    /** Cuotas restantes (crédito Yape): fecha de la próxima, monto y tasa para el prepago. */
    installments?: { next: string; remaining: number; amount: number; annualRate: number | null };
    /** Calendario fijo (deuda previa de la tarjeta): "YYYY-MM" → monto. */
    schedule?: Record<string, number>;
  }[];
  ctsStart: number;
  afpStart: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  let [y, m] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Bono por desempeño (SPEC 9): 0 a 2 sueldos en abril desde 2028; ~14% de impuesto. */
const BONUS_TAX = 0.14;

export function buildProjectionInput(ctx: ProjectionContext, scenario: { living: number; bonusSalaries: number }): ProjectionInput {
  const currentYm = ctx.today.slice(0, 7);
  const months = monthsBetween(currentYm, ctx.endYm);
  const tax = (ym: string) => monthlyTaxFor(ym, ctx.taxTable);
  const income: Record<string, number> = {};
  const living: Record<string, number> = {};
  const ctsDeposits: Record<string, number> = {};
  const [ty, tm, td] = ctx.today.split("-").map(Number);
  const daysInCurrent = new Date(Date.UTC(ty, tm, 0)).getUTCDate();

  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const isCurrent = ym === currentYm;
    let total = 0;
    // Solo lo que todavía no entró (lo de hoy o antes ya está en los saldos).
    for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
      const date = `${ym}-${pad(d)}`;
      if (date <= ctx.today) continue;
      for (const p of salaryPaymentsOn(date, ctx.salary, tax)) total += p.amount;
    }
    for (const e of incomeEventsInMonth(y, m, ctx.income, ctx.calendar, ctx.estimates)) {
      if (isCurrent && (e.dayUnknown || e.date <= ctx.today)) continue;
      if (e.illiquid) ctsDeposits[ym] = (ctsDeposits[ym] ?? 0) + e.amount;
      else total += e.amount;
    }
    if (m === ctx.calendar.utilidades_month && y >= 2028 && scenario.bonusSalaries > 0) {
      total += scenario.bonusSalaries * ctx.salary.monthlyGross * (1 - BONUS_TAX);
    }
    income[ym] = round2(total);
    living[ym] = isCurrent ? round2((scenario.living * (daysInCurrent - td)) / daysInCurrent) : scenario.living;
  }

  const debts: ProjectionDebt[] = ctx.debts.map((d) => {
    if (d.installments) {
      const { next, remaining, amount, annualRate } = d.installments;
      const schedule: Record<string, number> = {};
      monthsBetween(next.slice(0, 7), "2100-12").slice(0, remaining).forEach((ym) => (schedule[ym] = amount));
      return {
        name: d.name,
        order: d.order,
        balance: d.balancePen,
        schedule,
        payoff: annualRate ? (n: number) => prepayment(n, amount, annualRate).payoff : undefined,
      };
    }
    return { name: d.name, order: d.order, balance: d.balancePen, schedule: d.schedule };
  });

  return {
    months,
    startCash: ctx.startCash,
    living,
    income,
    debts,
    cts: { start: ctx.ctsStart, deposits: ctsDeposits },
    // 10% del sueldo va al fondo AFP (SPEC 9.3); sin rentabilidad (conservador).
    afp: { start: ctx.afpStart, monthly: round2(ctx.salary.monthlyGross * ctx.salary.afpRates.aporte) },
  };
}
