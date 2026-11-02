// Saldo actual de una cuenta (SPEC 4): saldo inicial + movimientos confirmados desde su fecha.
// - gasto, retiro_efectivo y pago_deuda salen de account_id.
// - ingreso y reembolso entran a account_id.
// - transferencia y pago_tarjeta salen de account_id y entran a counterpart_account_id
//   (pagar la tarjeta baja lo usado: su saldo negativo sube).
// - Un retiro de cajero entra al Efectivo solo si se registra con counterpart = Efectivo.

import { round2 } from "./money";

export type BalanceAccount = {
  id: string;
  currency: "PEN" | "USD";
  openingBalance: number | null;
  openingBalanceAt: string | null;
};

export type BalanceTx = {
  type: "gasto" | "ingreso" | "transferencia" | "pago_tarjeta" | "pago_deuda" | "reembolso" | "retiro_efectivo";
  status: "confirmado" | "por_revisar" | "anulado";
  occurredAt: string;
  amount: number;
  currency: "PEN" | "USD";
  amountPen: number;
  accountId: string;
  counterpartAccountId: string | null;
};

const OUT = new Set(["gasto", "retiro_efectivo", "pago_deuda", "transferencia", "pago_tarjeta"]);
const IN = new Set(["ingreso", "reembolso"]);
const MOVES_TO_COUNTERPART = new Set(["transferencia", "pago_tarjeta", "retiro_efectivo"]);

/** Monto del movimiento en la moneda de la cuenta (null si no se puede convertir). */
function inAccountCurrency(tx: BalanceTx, account: BalanceAccount): number | null {
  if (tx.currency === account.currency) return tx.amount;
  if (account.currency === "PEN") return tx.amountPen; // consumo en US$ cargado a una cuenta en soles
  return null; // soles en una cuenta en dólares: no hay tipo de cambio para convertir
}

/** Saldos por cuenta. null = sin saldo inicial (desconocido). */
export function accountBalances(accounts: BalanceAccount[], transactions: BalanceTx[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const account of accounts) {
    if (account.openingBalance === null || account.openingBalanceAt === null) {
      result.set(account.id, null);
      continue;
    }
    const since = Date.parse(account.openingBalanceAt);
    let balance = account.openingBalance;
    for (const tx of transactions) {
      if (tx.status !== "confirmado" || Date.parse(tx.occurredAt) < since) continue;
      const amount = inAccountCurrency(tx, account);
      if (amount === null) continue;
      if (tx.accountId === account.id) {
        if (OUT.has(tx.type)) balance -= amount;
        else if (IN.has(tx.type)) balance += amount;
      }
      if (tx.counterpartAccountId === account.id && MOVES_TO_COUNTERPART.has(tx.type)) balance += amount;
    }
    result.set(account.id, round2(balance));
  }
  return result;
}
