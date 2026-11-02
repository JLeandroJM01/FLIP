import { describe, expect, it } from "vitest";
import { accountBalances, type BalanceAccount, type BalanceTx } from "@/lib/finance";

const T0 = "2026-11-02T17:00:00Z";
const after = "2026-11-02T18:00:00Z";
const before = "2026-11-02T16:00:00Z";

const sueldo: BalanceAccount = { id: "sueldo", currency: "PEN", openingBalance: 298.57, openingBalanceAt: T0 };
const ahorros: BalanceAccount = { id: "ahorros", currency: "PEN", openingBalance: 422.53, openingBalanceAt: T0 };
const visa: BalanceAccount = { id: "visa", currency: "PEN", openingBalance: -6568.52, openingBalanceAt: T0 };
const efectivo: BalanceAccount = { id: "efectivo", currency: "PEN", openingBalance: null, openingBalanceAt: null };

const tx = (t: Partial<BalanceTx> & Pick<BalanceTx, "type" | "amount" | "accountId">): BalanceTx => ({
  status: "confirmado",
  occurredAt: after,
  currency: "PEN",
  amountPen: t.amount,
  counterpartAccountId: null,
  ...t,
});

describe("saldos de cuentas", () => {
  it("sin movimientos, el saldo es el inicial", () => {
    const b = accountBalances([sueldo, ahorros], []);
    expect(b.get("sueldo")).toBe(298.57);
    expect(b.get("ahorros")).toBe(422.53);
  });

  it("gastos restan, ingresos y yapeos recibidos suman", () => {
    const b = accountBalances(
      [ahorros],
      [
        tx({ type: "gasto", amount: 22.53, accountId: "ahorros" }),
        tx({ type: "reembolso", amount: 60, accountId: "ahorros" }),
        tx({ type: "ingreso", amount: 100, accountId: "ahorros" }),
      ],
    );
    expect(b.get("ahorros")).toBe(560);
  });

  it("una transferencia entre cuentas propias no cambia el total", () => {
    const b = accountBalances([sueldo, ahorros], [
      tx({ type: "transferencia", amount: 100, accountId: "sueldo", counterpartAccountId: "ahorros" }),
    ]);
    expect(b.get("sueldo")).toBe(198.57);
    expect(b.get("ahorros")).toBe(522.53);
  });

  it("pagar la tarjeta baja lo usado de la línea", () => {
    const b = accountBalances([sueldo, visa], [
      tx({ type: "pago_tarjeta", amount: 200, accountId: "sueldo", counterpartAccountId: "visa" }),
      tx({ type: "gasto", amount: 50, accountId: "visa" }),
    ]);
    expect(b.get("sueldo")).toBe(98.57);
    expect(b.get("visa")).toBe(-6418.52);
  });

  it("un consumo en dólares con la tarjeta en soles usa el monto en soles", () => {
    const b = accountBalances([visa], [
      tx({ type: "gasto", amount: 10, currency: "USD", amountPen: 34.5, accountId: "visa" }),
    ]);
    expect(b.get("visa")).toBe(-6603.02);
  });

  it("no cuentan los movimientos anteriores al saldo inicial, ni anulados ni por revisar", () => {
    const b = accountBalances([sueldo], [
      tx({ type: "gasto", amount: 10, accountId: "sueldo", occurredAt: before }),
      tx({ type: "gasto", amount: 20, accountId: "sueldo", status: "anulado" }),
      tx({ type: "gasto", amount: 30, accountId: "sueldo", status: "por_revisar" }),
    ]);
    expect(b.get("sueldo")).toBe(298.57);
  });

  it("sin saldo inicial, el saldo es desconocido", () => {
    expect(accountBalances([efectivo], []).get("efectivo")).toBeNull();
  });
});
