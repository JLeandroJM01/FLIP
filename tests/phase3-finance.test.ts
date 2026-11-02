import { describe, expect, it } from "vitest";
import {
  buildProjectionInput,
  cardPaymentEstimate,
  DEFAULT_AFP_RATES,
  downPaymentAvailable,
  incomeEventsInMonth,
  installmentDueDates,
  monthlyTaxFor,
  mortgagePayment,
  nextPaymentDate,
  prepayment,
  project,
} from "@/lib/finance";

describe("impuesto mensual estimado", () => {
  const table = { "2026": 0, "2026-12": 100, "2027": 339.77, "2028": 530 };
  it("usa el mes puntual, luego el año, luego el último año conocido", () => {
    expect(monthlyTaxFor("2026-12", table)).toBe(100);
    expect(monthlyTaxFor("2027-05", table)).toBe(339.77);
    expect(monthlyTaxFor("2029-03", table)).toBe(530);
    expect(monthlyTaxFor("2025-01", table)).toBe(0);
  });
});

describe("calendario de ingresos (SPEC 9, fechas del usuario)", () => {
  const profile = {
    startDate: "2026-10-26", endDate: null, monthlyGross: 4785, gratDaysBase: 35, gratBonusRate: 0.0675,
    profitSharingSalaries: 4.5, afpRates: DEFAULT_AFP_RATES,
  };
  const cal = { gratificacion_day: 15, cts_day: 20, utilidades_month: 4, utilidades_day: 20 };
  const est = { cts: { "2027-05": 2550, default: 2860 }, prima_utilidades: { "2027-03": 5260 }, vacation_month: 10 };
  const ev = (y: number, m: number) => incomeEventsInMonth(y, m, profile, cal, est);

  it("dic 2026: gratificación de 1,986.44 el 15; sin CTS en nov 2026", () => {
    expect(ev(2026, 12)).toEqual([expect.objectContaining({ kind: "gratificacion", date: "2026-12-15", amount: 1986.44 })]);
    expect(ev(2026, 11)).toEqual([]);
  });
  it("2027: Prima en marzo (día por confirmar), utilidades el 20 abr, CTS el 20 may, gratificación completa en julio", () => {
    expect(ev(2027, 3)).toEqual([expect.objectContaining({ kind: "otro", amount: 5260, dayUnknown: true })]);
    expect(ev(2027, 4)).toEqual([expect.objectContaining({ kind: "utilidades", date: "2027-04-20", amount: 3952.54 })]);
    expect(ev(2027, 5)).toEqual([expect.objectContaining({ kind: "cts", date: "2027-05-20", amount: 2550, illiquid: true })]);
    expect(ev(2027, 7)[0]).toMatchObject({ kind: "gratificacion", amount: 5959.32 });
  });
  it("asignación vacacional desde oct 2027 y utilidades completas desde abr 2028", () => {
    expect(ev(2026, 10)).toEqual([]);
    expect(ev(2027, 10)).toEqual([expect.objectContaining({ kind: "asignacion_vacacional", amount: 4164.39 })]);
    expect(ev(2028, 4)[0]).toMatchObject({ kind: "utilidades", amount: 21532.5 });
    expect(ev(2027, 11)).toEqual([expect.objectContaining({ kind: "cts", amount: 2860 })]);
  });
});

describe("tarjeta (SPEC 10)", () => {
  it("próximo día de pago", () => {
    expect(nextPaymentDate("2026-11-02", 5)).toBe("2026-11-05");
    expect(nextPaymentDate("2026-11-06", 5)).toBe("2026-12-05");
    expect(nextPaymentDate("2026-12-20", 5)).toBe("2027-01-05");
  });
  it("las cuotas empiezan en el próximo estado de cuenta", () => {
    expect(installmentDueDates("2026-11-02", 3, 5)).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
  });
  it("estimado = consumos del ciclo por moneda + cuotas del mes", () => {
    const r = cardPaymentEstimate({
      due: "2026-12-05",
      cycleStart: "2026-11-05",
      paymentDay: 5,
      consumptions: [
        { date: "2026-11-04", currency: "PEN", amount: 99 }, // ciclo anterior
        { date: "2026-11-10", currency: "PEN", amount: 38 },
        { date: "2026-11-12", currency: "USD", amount: 3.84 },
      ],
      plans: [
        { paseDate: "2026-11-02", installments: 3, amount: 408.23, currency: "PEN" },
        { paseDate: "2026-11-02", installments: 3, amount: 112.35, currency: "USD" },
      ],
    });
    expect(r).toMatchObject({ pen: 446.23, usd: 116.19, installmentsPen: 408.23, fromStatement: false });
  });
  it("si cargaste el estado de cuenta, manda ese monto", () => {
    const r = cardPaymentEstimate({ due: "2026-11-05", cycleStart: "2026-10-05", paymentDay: 5, consumptions: [], plans: [], statement: { due: "2026-11-05", pen: 0, usd: 0 } });
    expect(r).toMatchObject({ pen: 0, usd: 0, fromStatement: true });
  });
});

describe("deudas", () => {
  it("prepagar las 8 cuotas del crédito Yape (TCEA ~110%) ahorra intereses", () => {
    const p = prepayment(8, 276.73, 1.102);
    expect(p.totalIfNotPrepaid).toBe(2213.84);
    expect(p.payoff).toBeLessThan(2213.84);
    expect(p.interestSaved).toBeGreaterThan(400);
  });
});

describe("proyección", () => {
  const months = ["2026-11", "2026-12", "2027-01", "2027-02"];
  it("paga las deudas en el orden del usuario y luego ahorra", () => {
    const r = project({
      months,
      startCash: 700,
      living: Object.fromEntries(months.map((m) => [m, 1500])),
      income: { "2026-11": 3225.38, "2026-12": 6150.83, "2027-01": 4064.39, "2027-02": 3824.62 },
      debts: [
        { name: "Daniela", order: 1, balance: 1687.05 },
        { name: "Walter", order: 2, balance: 2000 },
        { name: "Crédito Yape", order: 3, balance: 2213.84, schedule: { "2026-11": 276.73, "2026-12": 276.73, "2027-01": 276.73, "2027-02": 276.73 }, payoff: (n) => n * 250 },
      ],
    });
    expect(r.paidOff.Daniela).toBe("2026-11");
    expect(r.paidOff.Walter).toBe("2026-12");
    expect(r.debtFreeMonth).not.toBeNull();
    const last = r.months.at(-1)!;
    expect(last.debtsLeft).toBe(0);
    expect(last.savings).toBeGreaterThan(0);
  });
  it("cuota hipotecaria del SPEC 14.1: 30% de inicial → ~S/ 2,050", () => {
    // 400,000 − 120,000 de inicial − 7,900 de Bono del Buen Pagador, TEA 8%, 25 años
    expect(mortgagePayment(400000 - 120000 - 7900, 0.08, 25)).toBeCloseTo(2050, -2);
  });
  it("inicial disponible = ahorro + 50% CTS + 25% AFP", () => {
    expect(downPaymentAvailable({ savings: 100000, cts: 16800, afp: 20000 })).toBe(113400);
  });
});

describe("proyección con los datos del SPEC (sección 14)", () => {
  // Mismo contexto que arma lib/projection-data con el seed (2 nov 2026).
  const ctx = {
    today: "2026-11-02",
    endYm: "2029-11",
    startCash: 721.1,
    salary: { startDate: "2026-10-26", endDate: null, monthlyGross: 4785, paySchedule: [{ day: 20, share: 0.5 }, { day: 5, share: 0.5, month_offset: 1 }], afpRates: DEFAULT_AFP_RATES },
    income: { startDate: "2026-10-26", endDate: null, monthlyGross: 4785, gratDaysBase: 35, gratBonusRate: 0.0675, profitSharingSalaries: 4.5, afpRates: DEFAULT_AFP_RATES },
    taxTable: { "2026": 0, "2026-12": 100, "2027": 339.77, "2028": 530 },
    calendar: { gratificacion_day: 15, cts_day: 20, utilidades_month: 4, utilidades_day: 20 },
    estimates: { cts: { "2027-05": 2550, default: 2860 }, prima_utilidades: { "2027-03": 5260 }, vacation_month: 10 },
    bonusMaxSalaries: 2,
    debts: [
      { name: "Tarjeta (consumos anteriores)", order: null, balancePen: 0, schedule: { "2026-12": 3380, "2027-01": 3188.52 } },
      { name: "Daniela", order: 1, balancePen: 1687.05 },
      { name: "Walter", order: 2, balancePen: 2000 },
      { name: "Crédito Yape", order: 3, balancePen: 2213.84, installments: { next: "2026-11-28", remaining: 8, amount: 276.73, annualRate: 1.102 } },
    ],
    ctsStart: 0,
    afpStart: 1200,
  };
  const run = (living: number, bonusSalaries = 0) => project(buildProjectionInput(ctx, { living, bonusSalaries }));

  it.each([
    [1500, 168000],
    [2000, 150000],
    [2500, 131000],
  ])("gasto S/ %i: ahorro a nov 2029 cerca del SPEC (~S/ %i, ±3%%)", (living, spec) => {
    const last = run(living).months.at(-1)!;
    expect(Math.abs(last.savings - spec) / spec).toBeLessThan(0.03);
  });

  it("con S/ 1,500: Daniela en nov, sin deudas a inicios de 2027 y sin meses en negativo", () => {
    const r = run(1500);
    expect(r.paidOff.Daniela).toBe("2026-11");
    expect(r.debtFreeMonth! <= "2027-03").toBe(true);
    expect(r.months.filter((m) => m.savings < 0)).toEqual([]);
  });

  it("el bono de 2 sueldos suma ~S/ 16,000 a nov 2029 (SPEC: 168k → 185k)", () => {
    const diff = run(1500, 2).months.at(-1)!.savings - run(1500, 0).months.at(-1)!.savings;
    expect(diff).toBeGreaterThan(15000);
    expect(diff).toBeLessThan(18000);
  });
});
