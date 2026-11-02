// Valores de referencia: docs/SPEC.md, secciones 9 y 19. Tolerancia ± S/ 0.05.
import { describe, expect, it } from "vitest";
import {
  afpDiscount,
  afpFundContribution,
  afpTotalRate,
  annualIncomeTax,
  daysInYear,
  daysWorkedInYear,
  DEFAULT_AFP_RATES,
  gratification,
  gratificationCompleteMonths,
  monthlyNet,
  profitSharingByDays,
  profitSharingByEarnings,
} from "@/lib/finance";

const TOLERANCE = 0.05;
function expectSoles(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE);
}

// Perfil de Luz del Sur (SPEC 9)
const GROSS = 4785;
const START = "2026-10-26";
const UIT = 5500;
const GRAT = { monthlyGross: GROSS, daysBase: 35, bonusRate: 0.0675 };

// Componentes de 2027
const gratFull = gratification({ ...GRAT, completeMonths: 6 });
const utilidadesLdS2026 = profitSharingByDays({
  monthlyGross: GROSS,
  salaries: 4.5,
  daysWorked: daysWorkedInYear(2026, START),
  daysInYear: daysInYear(2026),
});
const utilidadesPrima2026 = profitSharingByEarnings({
  salaries: 3.5,
  earnedInYear: 7 * 2200 + (1 + 23 / 31) * 3200,
});
const gross2027 = 12 * GROSS + 2 * gratFull + utilidadesLdS2026;
const tax2027 = annualIncomeTax(gross2027, UIT);
const tax2027WithPrima = annualIncomeTax(gross2027 + utilidadesPrima2026, UIT);

describe("AFP", () => {
  it("descuento total 12.97% = S/ 620.61", () => {
    expect(afpTotalRate(DEFAULT_AFP_RATES)).toBeCloseTo(0.1297, 10);
    expectSoles(afpDiscount(GROSS, DEFAULT_AFP_RATES), 620.61);
  });
  it("solo el 10% va al fondo", () => {
    expectSoles(afpFundContribution(GROSS, DEFAULT_AFP_RATES), 478.5);
  });
});

describe("gratificación", () => {
  it("base de 35 días = S/ 5,582.50 y con 6.75% = ~S/ 5,959", () => {
    expectSoles(gratification({ ...GRAT, bonusRate: 0, completeMonths: 6 }), 5582.5);
    expectSoles(gratFull, 5959.32);
  });
  it("diciembre 2026 = S/ 1,986.44 (solo nov y dic son meses completos)", () => {
    const months = gratificationCompleteMonths(12, 2026, START);
    expect(months).toBe(2);
    expectSoles(gratification({ ...GRAT, completeMonths: months }), 1986.44);
  });
  it("julio 2027 cuenta el semestre completo", () => {
    expect(gratificationCompleteMonths(7, 2027, START)).toBe(6);
  });
});

describe("utilidades", () => {
  it("Luz del Sur abril 2027 = 4.5 × 4,785 × 67/365 ≈ S/ 3,952.54", () => {
    expect(daysWorkedInYear(2026, START)).toBe(67);
    expectSoles(utilidadesLdS2026, 3952.54);
  });
  it("Prima AFP marzo 2027 ≈ S/ 6,117.47", () => {
    expectSoles(utilidadesPrima2026, 6117.47);
  });
});

describe("impuesto de quinta", () => {
  it("2027 sin utilidades de Prima ≈ S/ 3,220.74", () => {
    expectSoles(tax2027, 3220.74);
  });
  it("2027 con utilidades de Prima ≈ S/ 4,077.19", () => {
    expectSoles(tax2027WithPrima, 4077.19);
  });
  it("no hay impuesto hasta 7 UIT", () => {
    expect(annualIncomeTax(7 * UIT, UIT)).toBe(0);
    expect(annualIncomeTax(10_000, UIT)).toBe(0);
  });
  it("aplica los tramos 8% / 14% / 17% / 20% / 30%", () => {
    const at = (uitOverDeduction: number) => annualIncomeTax((7 + uitOverDeduction) * UIT, UIT);
    expectSoles(at(5), 0.08 * 5 * UIT);
    expectSoles(at(20), (0.08 * 5 + 0.14 * 15) * UIT);
    expectSoles(at(35), (0.08 * 5 + 0.14 * 15 + 0.17 * 15) * UIT);
    expectSoles(at(45), (0.08 * 5 + 0.14 * 15 + 0.17 * 15 + 0.2 * 10) * UIT);
    expectSoles(at(50), (0.08 * 5 + 0.14 * 15 + 0.17 * 15 + 0.2 * 10 + 0.3 * 5) * UIT);
  });
});

describe("neto mensual", () => {
  it("promedio 2027 ≈ S/ 3,824.62", () => {
    expectSoles(
      monthlyNet({ monthlyGross: GROSS, afpRates: DEFAULT_AFP_RATES, annualTax: tax2027WithPrima }),
      3824.62,
    );
  });
});
