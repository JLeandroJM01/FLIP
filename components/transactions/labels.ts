import type { TransactionRow, TxType } from "@/lib/types";

export const TYPE_LABELS: Record<TxType, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  reembolso: "Me yapearon",
  transferencia: "Transferencia",
  pago_tarjeta: "Pago de tarjeta",
  pago_deuda: "Pago de deuda",
  retiro_efectivo: "Retiro de efectivo",
};

/** Texto principal de un movimiento: nota, comercio, persona o categoría. */
export function describe(tx: TransactionRow): string {
  if (tx.type === "reembolso" && tx.person) return `Me yapeó ${tx.person.name}`;
  return tx.note || tx.merchant || tx.category?.name || TYPE_LABELS[tx.type];
}

/** Ingresos y reembolsos suman; gastos y retiros restan; el resto no cuenta. */
export function direction(type: TxType): "in" | "out" | "neutral" {
  if (type === "ingreso" || type === "reembolso") return "in";
  if (type === "gasto" || type === "retiro_efectivo") return "out";
  return "neutral";
}
