// Tarjeta de crédito (SPEC 10): fecha del próximo pago, cuotas y pago estimado del mes.
import { round2 } from "./money";

const pad = (n: number) => String(n).padStart(2, "0");

/** Próximo día de pago (YYYY-MM-DD) desde `today` (incluido). */
export function nextPaymentDate(today: string, paymentDay: number): string {
  const [y, m, d] = today.split("-").map(Number);
  if (d <= paymentDay) return `${y}-${pad(m)}-${pad(paymentDay)}`;
  return m === 12 ? `${y + 1}-01-${pad(paymentDay)}` : `${y}-${pad(m + 1)}-${pad(paymentDay)}`;
}

/** Días entre dos fechas YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Vencimientos de una compra pasada a cuotas: "se incluye en tu próximo estado de cuenta". */
export function installmentDueDates(paseDate: string, installments: number, paymentDay: number): string[] {
  let [y, m] = paseDate.split("-").map(Number);
  const dates: string[] = [];
  for (let i = 0; i < installments; i++) {
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    dates.push(`${y}-${pad(m)}-${pad(paymentDay)}`);
  }
  return dates;
}

export type CardConsumption = { date: string; currency: "PEN" | "USD"; amount: number };
export type CardInstallmentPlan = { paseDate: string; installments: number; amount: number; currency: "PEN" | "USD" };
export type CardStatement = { due: string; pen: number; usd: number };

/**
 * "A pagar el 5: ~S/ X + US$ Y" (SPEC 10). Si el usuario cargó el estado de cuenta de ese
 * vencimiento, se usa tal cual; si no, se suman los consumos del ciclo (desde `cycleStart`)
 * más las cuotas que vencen ese día.
 */
export function cardPaymentEstimate({
  due,
  cycleStart,
  consumptions,
  plans,
  paymentDay,
  statement,
}: {
  due: string;
  cycleStart: string;
  consumptions: CardConsumption[];
  plans: CardInstallmentPlan[];
  paymentDay: number;
  statement?: CardStatement | null;
}) {
  if (statement && statement.due === due) {
    return { pen: statement.pen, usd: statement.usd, installmentsPen: 0, installmentsUsd: 0, fromStatement: true };
  }
  let pen = 0;
  let usd = 0;
  for (const c of consumptions) {
    if (c.date < cycleStart || c.date >= due) continue;
    if (c.currency === "USD") usd += c.amount;
    else pen += c.amount;
  }
  let installmentsPen = 0;
  let installmentsUsd = 0;
  for (const p of plans) {
    if (!installmentDueDates(p.paseDate, p.installments, paymentDay).includes(due)) continue;
    if (p.currency === "USD") installmentsUsd += p.amount;
    else installmentsPen += p.amount;
  }
  return {
    pen: round2(pen + installmentsPen),
    usd: round2(usd + installmentsUsd),
    installmentsPen: round2(installmentsPen),
    installmentsUsd: round2(installmentsUsd),
    fromStatement: false,
  };
}
