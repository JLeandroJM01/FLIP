// Proyección mes a mes (SPEC 14 y 14.1). Pura: los datos los arma lib/projection-data.ts.
// Cada mes: entra el neto líquido, sale el gasto de vida y los pagos obligatorios
// (cuotas, deuda previa de la tarjeta); lo que sobra paga deudas en el orden del usuario
// y el resto se ahorra. CTS y fondo AFP van aparte: solo cuentan para la meta del depa.
import { round2 } from "./money";

export type ProjectionDebt = {
  name: string;
  /** Orden para pagos extra (1 = primero). null = solo se paga según su calendario. */
  order: number | null;
  /** Saldo en soles (sin calendario: se paga con lo que sobre). */
  balance: number;
  /** Pagos obligatorios por mes ("YYYY-MM" → monto). */
  schedule?: Record<string, number>;
  /** Cuánto costaría cancelar ya las cuotas que faltan (prepago). */
  payoff?: (remainingInstallments: number) => number;
};

export type ProjectionInput = {
  months: string[];
  startCash: number;
  /** Gasto de vida por mes (el del mes actual ya prorrateado). */
  living: Record<string, number>;
  /** Neto líquido que entra cada mes. */
  income: Record<string, number>;
  debts: ProjectionDebt[];
  cts?: { start: number; deposits: Record<string, number> };
  afp?: { start: number; monthly: number };
};

export type ProjectionMonth = {
  ym: string;
  income: number;
  living: number;
  debtPaid: number;
  savings: number;
  debtsLeft: number;
  cts: number;
  afp: number;
};

export type ProjectionResult = {
  months: ProjectionMonth[];
  /** Primer mes en que ya no queda ninguna deuda (null si no ocurre en el período). */
  debtFreeMonth: string | null;
  /** Mes en que cada deuda queda pagada. */
  paidOff: Record<string, string>;
};

type DebtState = ProjectionDebt & { left: number; remainingInstallments: number; done: boolean };

export function project(input: ProjectionInput): ProjectionResult {
  const debts: DebtState[] = input.debts.map((d) => {
    const installments = Object.values(d.schedule ?? {});
    return {
      ...d,
      left: d.schedule ? installments.reduce((s, x) => s + x, 0) : d.balance,
      remainingInstallments: installments.length,
      done: false,
    };
  });
  let cash = input.startCash;
  let cts = input.cts?.start ?? 0;
  let afp = input.afp?.start ?? 0;
  const months: ProjectionMonth[] = [];
  const paidOff: Record<string, string> = {};
  let debtFreeMonth: string | null = null;

  // Flujo de cada mes sin pagos extra: lo que entra − gasto de vida − pagos obligatorios.
  const baseFlow = input.months.map(
    (ym) =>
      (input.income[ym] ?? 0) -
      (input.living[ym] ?? 0) -
      input.debts.reduce((s, d) => s + (d.schedule?.[ym] ?? 0), 0),
  );
  /** Plata a guardar para cubrir los meses siguientes que vienen en negativo (hasta 3). */
  const reserveAfter = (i: number) => {
    let acc = 0;
    let worst = 0;
    for (let j = i + 1; j <= Math.min(i + 3, baseFlow.length - 1); j++) {
      acc += baseFlow[j];
      worst = Math.min(worst, acc);
    }
    return -worst;
  };

  for (const [i, ym] of input.months.entries()) {
    const income = input.income[ym] ?? 0;
    const living = input.living[ym] ?? 0;
    cash += income - living;
    let debtPaid = 0;

    // 1. Pagos obligatorios del mes.
    for (const d of debts) {
      const due = d.done ? 0 : (d.schedule?.[ym] ?? 0);
      if (due > 0) {
        cash -= due;
        debtPaid += due;
        d.left -= due;
        d.remainingInstallments -= 1;
      }
    }
    // 2. Pagos extra con lo que sobra (después de reservar lo de los próximos meses), en el orden del usuario.
    const reserve = reserveAfter(i);
    for (const d of debts.filter((x) => x.order != null && !x.done && x.left > 0.005).sort((a, b) => a.order! - b.order!)) {
      const free = cash - reserve;
      if (free <= 0) break;
      if (d.schedule) {
        // Cuotas: solo se prepaga si alcanza para cancelar todo.
        const cost = d.payoff ? d.payoff(d.remainingInstallments) : d.left;
        if (d.remainingInstallments > 0 && free >= cost) {
          cash -= cost;
          debtPaid += cost;
          d.left = 0;
          d.remainingInstallments = 0;
        }
      } else {
        const pay = Math.min(free, d.left);
        cash -= pay;
        debtPaid += pay;
        d.left -= pay;
      }
    }
    for (const d of debts) {
      if (!d.done && d.left <= 0.005) {
        d.done = true;
        d.left = 0;
        paidOff[d.name] = ym;
      }
    }
    const debtsLeft = debts.reduce((s, d) => s + d.left, 0);
    if (!debtFreeMonth && debtsLeft <= 0.005) debtFreeMonth = ym;

    cts += input.cts?.deposits[ym] ?? 0;
    afp += input.afp?.monthly ?? 0;
    months.push({
      ym,
      income: round2(income),
      living: round2(living),
      debtPaid: round2(debtPaid),
      savings: round2(cash),
      debtsLeft: round2(debtsLeft),
      cts: round2(cts),
      afp: round2(afp),
    });
  }
  return { months, debtFreeMonth, paidOff };
}

/** Inicial disponible para el depa (SPEC 14.1): ahorro + 50% de la CTS + 25% del fondo AFP. */
export function downPaymentAvailable(m: Pick<ProjectionMonth, "savings" | "cts" | "afp">): number {
  return round2(Math.max(0, m.savings) + 0.5 * m.cts + 0.25 * m.afp);
}

/** Cuota hipotecaria (SPEC 14.1): préstamo a TEA anual, plazo en años, cuota fija mensual. */
export function mortgagePayment(principal: number, tea: number, years: number): number {
  const r = Math.pow(1 + tea, 1 / 12) - 1;
  const n = years * 12;
  return round2((principal * r) / (1 - Math.pow(1 + r, -n)));
}
