import { describe, expect, it } from "vitest";
import { monthlySummary, type SummaryTx } from "@/lib/finance";

const CASH = "cat-efectivo";
const tx = (t: Partial<SummaryTx> & Pick<SummaryTx, "type" | "amountPen">): SummaryTx => ({
  status: "confirmado",
  categoryId: null,
  paidInCash: false,
  ...t,
});
const run = (transactions: SummaryTx[], before = { withdrawals: 0, cashExpenses: 0 }) =>
  monthlySummary({ transactions, cashTotalsBefore: before, cashCategoryId: CASH });

describe("no contar nada dos veces", () => {
  it("transferencias, pago de tarjeta y pago de deuda no son gasto ni ingreso", () => {
    const s = run([
      tx({ type: "transferencia", amountPen: 500 }),
      tx({ type: "pago_tarjeta", amountPen: 2000 }),
      tx({ type: "pago_deuda", amountPen: 276.73 }),
      tx({ type: "gasto", amountPen: 180, categoryId: "comida" }),
      tx({ type: "ingreso", amountPen: 2392.5 }),
    ]);
    expect(s.spending).toBe(180);
    expect(s.income).toBe(2392.5);
    expect(s.net).toBe(2212.5);
  });

  it("un reembolso (Me yapearon) resta del gastado, no suma ingreso", () => {
    const s = run([
      tx({ type: "gasto", amountPen: 180, categoryId: "comida" }),
      tx({ type: "reembolso", amountPen: 60 }),
      tx({ type: "reembolso", amountPen: 60 }),
    ]);
    expect(s.spending).toBe(60);
    expect(s.income).toBe(0);
    expect(s.reimbursements).toBe(120);
  });

  it("anulados y por revisar no cuentan", () => {
    const s = run([
      tx({ type: "gasto", amountPen: 50, status: "anulado" }),
      tx({ type: "gasto", amountPen: 70, status: "por_revisar" }),
    ]);
    expect(s.spending).toBe(0);
  });
});

describe("efectivo", () => {
  it("el retiro cuenta como gasto Efectivo", () => {
    const s = run([tx({ type: "retiro_efectivo", amountPen: 200 })]);
    expect(s.spending).toBe(200);
    expect(s.byCategory.get(CASH)).toBe(200);
  });

  it("un gasto en efectivo se descuenta del retiro: el total no cambia", () => {
    const s = run([
      tx({ type: "retiro_efectivo", amountPen: 200 }),
      tx({ type: "gasto", amountPen: 25, categoryId: "comida", paidInCash: true }),
    ]);
    expect(s.spending).toBe(200);
    expect(s.byCategory.get("comida")).toBe(25);
    expect(s.byCategory.get(CASH)).toBe(175);
  });

  it("lo que pasa de lo retirado sí es gasto nuevo", () => {
    const s = run([
      tx({ type: "retiro_efectivo", amountPen: 20 }),
      tx({ type: "gasto", amountPen: 25, categoryId: "comida", paidInCash: true }),
    ]);
    expect(s.spending).toBe(25);
    expect(s.byCategory.get("comida")).toBe(25);
    expect(s.byCategory.has(CASH)).toBe(false); // todo lo retirado ya está detallado
  });

  it("sin retiros (Fase 1), el gasto en efectivo cuenta completo", () => {
    const s = run([tx({ type: "gasto", amountPen: 12.5, categoryId: "comida", paidInCash: true })]);
    expect(s.spending).toBe(12.5);
    expect(s.byCategory.has(CASH)).toBe(false);
  });

  it("gastar en noviembre el efectivo retirado en octubre no vuelve a contar", () => {
    const oct = run([tx({ type: "retiro_efectivo", amountPen: 200 })]);
    const nov = run(
      [tx({ type: "gasto", amountPen: 30, categoryId: "comida", paidInCash: true })],
      oct.cashTotalsAfter,
    );
    expect(oct.spending).toBe(200);
    expect(nov.spending).toBe(0);
    expect(nov.byCategory.get("comida")).toBe(30);
    expect(nov.byCategory.get(CASH)).toBe(-30);
  });
});
