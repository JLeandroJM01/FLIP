// Resumen del mes para el Inicio (SPEC 1, 4, 8 y 13). Reglas para no contar dos veces:
// - transferencia, pago_tarjeta y pago_deuda no son gasto ni ingreso.
// - reembolso ("Me yapearon") resta del gastado del mes.
// - Efectivo: el retiro es gasto "Efectivo"; un gasto pagado en efectivo va a su
//   categoría y se descuenta del efectivo sin detallar. Solo lo que supere lo
//   retirado (acumulado) cuenta como gasto nuevo.
// - Solo cuentan los movimientos confirmados (los "por revisar" aún no se saben).

import { round2 } from "./money";

export type SummaryTx = {
  type:
    | "gasto"
    | "ingreso"
    | "transferencia"
    | "pago_tarjeta"
    | "pago_deuda"
    | "reembolso"
    | "retiro_efectivo";
  status: "confirmado" | "por_revisar" | "anulado";
  amountPen: number;
  categoryId: string | null;
  /** El gasto se pagó desde la billetera de Efectivo. */
  paidInCash: boolean;
};

export type CashTotals = { withdrawals: number; cashExpenses: number };

export type MonthlySummary = {
  income: number;
  /** Gastado neto del mes (ya con reembolsos restados). */
  spending: number;
  reimbursements: number;
  /** income − spending */
  net: number;
  /** Gasto por categoría; `cashCategoryId` recibe el efectivo sin detallar. */
  byCategory: Map<string | null, number>;
  /** Totales de efectivo acumulados al cierre del mes (para el mes siguiente). */
  cashTotalsAfter: CashTotals;
};

export function monthlySummary({
  transactions,
  cashTotalsBefore,
  cashCategoryId,
}: {
  transactions: SummaryTx[];
  /** Retiros y gastos en efectivo acumulados antes del mes. */
  cashTotalsBefore: CashTotals;
  /** id de la categoría "Efectivo". */
  cashCategoryId: string | null;
}): MonthlySummary {
  let income = 0;
  let reimbursements = 0;
  let nonCashSpending = 0;
  let withdrawals = 0;
  let cashExpenses = 0;
  const byCategory = new Map<string | null, number>();
  const add = (key: string | null, amount: number) =>
    byCategory.set(key, (byCategory.get(key) ?? 0) + amount);

  for (const tx of transactions) {
    if (tx.status !== "confirmado") continue;
    switch (tx.type) {
      case "ingreso":
        income += tx.amountPen;
        break;
      case "reembolso":
        reimbursements += tx.amountPen;
        break;
      case "retiro_efectivo":
        withdrawals += tx.amountPen;
        break;
      case "gasto":
        if (tx.paidInCash) cashExpenses += tx.amountPen;
        else nonCashSpending += tx.amountPen;
        add(tx.categoryId, tx.amountPen);
        break;
      default:
        break; // transferencia, pago_tarjeta, pago_deuda: no cuentan
    }
  }

  const before = cashTotalsBefore;
  const after: CashTotals = {
    withdrawals: before.withdrawals + withdrawals,
    cashExpenses: before.cashExpenses + cashExpenses,
  };
  // Lo contado como gasto en efectivo hasta una fecha = max(retirado, gastado en efectivo).
  const cashSpending =
    Math.max(after.withdrawals, after.cashExpenses) -
    Math.max(before.withdrawals, before.cashExpenses);
  const undetailedCash = cashSpending - cashExpenses;
  if (Math.abs(undetailedCash) >= 0.005) add(cashCategoryId, undetailedCash);

  for (const [key, value] of byCategory) byCategory.set(key, round2(value));

  const spending = round2(nonCashSpending + cashSpending - reimbursements);
  return {
    income: round2(income),
    spending,
    reimbursements: round2(reimbursements),
    net: round2(income - spending),
    byCategory,
    cashTotalsAfter: { withdrawals: round2(after.withdrawals), cashExpenses: round2(after.cashExpenses) },
  };
}
