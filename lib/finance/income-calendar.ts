// Calendario de ingresos que no son sueldo (SPEC 9): gratificaciones, CTS, utilidades,
// utilidades de Prima AFP y asignación vacacional. Fechas de settings.income_calendar (usuario).
import { afpTotalRate, type AfpRates } from "./afp";
import { gratification, gratificationCompleteMonths } from "./gratification";
import { round2 } from "./money";
import { daysInYear, daysWorkedInYear, profitSharingByDays } from "./profit-sharing";

export type IncomeCalendar = { gratificacion_day: number; cts_day: number; utilidades_month: number; utilidades_day: number };
export type IncomeEstimates = {
  cts: Record<string, number>; // "YYYY-MM" puntual o "default"
  prima_utilidades: Record<string, number>; // "YYYY-MM" → neto
  vacation_month: number;
};
export type IncomeProfileLite = {
  startDate: string;
  endDate: string | null;
  monthlyGross: number;
  gratDaysBase: number;
  gratBonusRate: number;
  profitSharingSalaries: number;
  afpRates: AfpRates;
};

export type IncomeEvent = {
  kind: "gratificacion" | "cts" | "utilidades" | "asignacion_vacacional" | "otro";
  date: string; // YYYY-MM-DD
  amount: number;
  label: string;
  /** El día exacto no se conoce (no se registra solo; solo cuenta en la proyección). */
  dayUnknown?: boolean;
  /** Va a una cuenta no líquida (CTS): no suma al neto del mes ni al ahorro. */
  illiquid?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** Eventos de un mes (año y mes 1–12). */
export function incomeEventsInMonth(
  year: number,
  month: number,
  profile: IncomeProfileLite,
  calendar: IncomeCalendar,
  estimates: IncomeEstimates,
): IncomeEvent[] {
  const events: IncomeEvent[] = [];
  const ym = `${year}-${pad(month)}`;
  const employed = (date: string) => date >= profile.startDate && (!profile.endDate || date <= profile.endDate);

  // Gratificación (julio y diciembre): sin AFP; el impuesto va en el estimado mensual.
  if (month === 7 || month === 12) {
    const date = `${ym}-${pad(calendar.gratificacion_day)}`;
    const months = gratificationCompleteMonths(month, year, profile.startDate, profile.endDate);
    if (months > 0 && employed(date)) {
      events.push({
        kind: "gratificacion",
        date,
        amount: gratification({ monthlyGross: profile.monthlyGross, daysBase: profile.gratDaysBase, bonusRate: profile.gratBonusRate, completeMonths: months }),
        label: `Gratificación de ${MONTHS[month - 1]}`,
      });
    }
  }

  // CTS (mayo y noviembre): a la cuenta CTS, no líquida. Montos del SPEC 9.
  if (month === 5 || month === 11) {
    const date = `${ym}-${pad(calendar.cts_day)}`;
    const keys = Object.keys(estimates.cts).filter((k) => k !== "default").sort();
    const amount = estimates.cts[ym] ?? (keys.length && ym > keys[0] ? estimates.cts.default : undefined);
    if (amount && employed(date)) events.push({ kind: "cts", date, amount, label: `CTS de ${MONTHS[month - 1]}`, illiquid: true });
  }

  // Utilidades de Luz del Sur (abril): N sueldos × días trabajados del año anterior.
  if (month === calendar.utilidades_month) {
    const date = `${ym}-${pad(calendar.utilidades_day)}`;
    const days = daysWorkedInYear(year - 1, profile.startDate, profile.endDate);
    if (days > 0) {
      events.push({
        kind: "utilidades",
        date,
        amount: profitSharingByDays({
          monthlyGross: profile.monthlyGross,
          salaries: profile.profitSharingSalaries,
          daysWorked: days,
          daysInYear: daysInYear(year - 1),
        }),
        label: `Utilidades ${year - 1}`,
      });
    }
  }

  // Utilidades de Prima AFP (trabajo anterior): mes conocido, día no.
  if (estimates.prima_utilidades[ym]) {
    events.push({ kind: "otro", date: `${ym}-01`, amount: estimates.prima_utilidades[ym], label: "Utilidades Prima AFP (neto)", dayUnknown: true });
  }

  // Asignación vacacional: 1 sueldo al año desde que cumple 1 año (SPEC 9: desde oct 2027); con AFP.
  const anniversary = `${Number(profile.startDate.slice(0, 4)) + 1}${profile.startDate.slice(4)}`;
  if (month === estimates.vacation_month && `${ym}-28` >= anniversary && employed(`${ym}-01`)) {
    events.push({
      kind: "asignacion_vacacional",
      date: `${ym}-01`,
      amount: round2(profile.monthlyGross * (1 - afpTotalRate(profile.afpRates))),
      label: "Asignación vacacional",
      dayUnknown: true,
    });
  }
  return events;
}
