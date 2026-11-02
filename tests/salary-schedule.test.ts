// Montos de la sección 9.5 del SPEC.
import { describe, expect, it } from "vitest";
import { DEFAULT_AFP_RATES, salaryPaymentsOn, type SalaryProfile } from "@/lib/finance";

const profile: SalaryProfile = {
  startDate: "2026-10-26",
  endDate: null,
  monthlyGross: 4785,
  paySchedule: [{ day: 20, share: 0.5 }, { day: 5, share: 0.5, month_offset: 1 }],
  afpRates: DEFAULT_AFP_RATES,
};
// settings.monthly_tax_estimate (SPEC 9: 2026 ~S/ 100 retenidos en diciembre; 2027 ~S/ 340/mes)
const TAX: Record<string, number> = { "2026": 0, "2026-12": 100, "2027": 339.77 };
const tax = (ym: string) => TAX[ym] ?? TAX[ym.slice(0, 4)] ?? 0;
const on = (date: string, p = profile) => salaryPaymentsOn(date, p, tax);

describe("sueldo automático (SPEC 9.5)", () => {
  it("5 nov 2026: los 6 días de octubre = 4,785 × 6/30 − AFP = S/ 832.88", () => {
    expect(on("2026-11-05")).toEqual([{ date: "2026-11-05", covers: "2026-10", part: "parcial", amount: 832.88 }]);
  });
  it("20 oct 2026: todavía no trabajaba → nada", () => {
    expect(on("2026-10-20")).toEqual([]);
  });
  it("20 nov 2026: adelanto del 50% del bruto = S/ 2,392.50", () => {
    expect(on("2026-11-20")).toEqual([{ date: "2026-11-20", covers: "2026-11", part: "adelanto", amount: 2392.5 }]);
  });
  it("5 dic 2026: resto de noviembre = 4,785 − 2,392.50 − 620.61 = S/ 1,771.89", () => {
    expect(on("2026-12-05")[0]).toMatchObject({ covers: "2026-11", part: "resto", amount: 1771.89 });
  });
  it("5 ene 2027: resto de diciembre con la retención de diciembre (~S/ 100)", () => {
    expect(on("2027-01-05")[0]).toMatchObject({ covers: "2026-12", amount: 1671.89 });
  });
  it("5 feb 2027: resto de enero con el impuesto de 2027 (~S/ 339.77)", () => {
    expect(on("2027-02-05")[0]).toMatchObject({ covers: "2027-01", amount: 1432.12 });
  });
  it("un día que no es de pago → nada", () => {
    expect(on("2026-11-06")).toEqual([]);
  });
  it("pago único el 20: bruto − AFP − impuesto", () => {
    const single = { ...profile, paySchedule: [{ day: 20, share: 1 }] };
    expect(on("2027-03-20", single)[0]).toMatchObject({ part: "unico", covers: "2027-03", amount: 3824.62 });
  });
  it("si el usuario corrigió un pago, los siguientes usan el monto real", () => {
    const real = salaryPaymentsOn("2027-02-05", profile, tax, (part) => (part === "resto" ? 1500 : null));
    expect(real[0].amount).toBe(1500);
  });
});
