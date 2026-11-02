import "server-only";
// Pantalla de tarjeta (SPEC 10): uso de la línea, pago estimado del día 5, cuotas y alertas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettings, TRANSACTION_SELECT } from "@/lib/data";
import { limaDateKey } from "@/lib/dates";
import { cardPaymentEstimate, daysBetween, installmentDueDates, nextPaymentDate, round2, type CardInstallmentPlan } from "@/lib/finance";
import type { CardStatementSetting } from "@/lib/projection-data";
import type { Database } from "@/lib/supabase/database.types";
import type { Catalogs, TransactionRow } from "@/lib/types";

type DB = SupabaseClient<Database>;

export async function getCardOverview(supabase: DB, catalogs: Catalogs, balances: Map<string, number | null>, today: string) {
  const card = catalogs.accounts.find((a) => a.type === "credito");
  if (!card) return null;
  const paymentDay = card.payment_day ?? 5;
  const due = nextPaymentDate(today, paymentDay);
  const prev = new Date(`${due}T12:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const cycleStart = prev.toISOString().slice(0, 10);

  const [settings, { data: txs }, { data: plansRaw }, { data: fxRow }] = await Promise.all([
    getSettings(supabase),
    supabase
      .from("transactions")
      .select(TRANSACTION_SELECT)
      .eq("account_id", card.id)
      .eq("type", "gasto")
      .neq("status", "anulado")
      .gte("occurred_at", `${cycleStart}T00:00:00-05:00`)
      .order("occurred_at", { ascending: false }),
    supabase.from("debts").select("*").eq("account_id", card.id).not("external_op_id", "is", null),
    supabase.from("fx_rates").select("usd_pen, date").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const statements = (settings.card_statements ?? []) as CardStatementSetting[];
  const statement = statements.find((s) => s.due === due) ?? null;
  const fx = fxRow ? Number(fxRow.usd_pen) : (((settings.projection ?? {}) as { fx?: number }).fx ?? 3.45);

  const plans = (plansRaw ?? []).map((d) => {
    const paseDate = d.notes?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? today;
    const dueDates = installmentDueDates(paseDate, d.installments_total ?? 1, paymentDay);
    return {
      id: d.id,
      name: d.name.replace(/^Cuotas: /, ""),
      currency: d.currency,
      amount: Number(d.installment_amount ?? 0),
      installments: d.installments_total ?? 1,
      paseDate,
      remaining: dueDates.filter((x) => x >= today).length,
      nextDue: dueDates.find((x) => x >= today) ?? null,
      notes: d.notes,
    };
  });
  const estimate = cardPaymentEstimate({
    due,
    cycleStart,
    paymentDay,
    statement,
    consumptions: (txs ?? []).map((t) => ({ date: limaDateKey(new Date(t.occurred_at)), currency: t.currency, amount: Number(t.amount) })),
    plans: plans.map<CardInstallmentPlan>((p) => ({ paseDate: p.paseDate, installments: p.installments, amount: p.amount, currency: p.currency })),
  });

  const used = -(balances.get(card.id) ?? 0);
  const limit = Number(card.credit_limit ?? 0);
  const payFrom = catalogs.accounts.find((a) => a.type === "corriente");
  const payFromBalance = payFrom ? balances.get(payFrom.id) : null;
  const totalPen = round2(estimate.pen + estimate.usd * fx);

  return {
    card,
    due,
    cycleStart,
    daysToDue: daysBetween(today, due),
    estimate,
    statementSource: statement?.source ?? null,
    totalPen,
    fx,
    used: round2(used),
    limit,
    usedPct: limit > 0 ? (used / limit) * 100 : 0,
    payFrom: payFrom ? { name: payFrom.name, balance: payFromBalance ?? null } : null,
    shortfall: payFromBalance != null && payFromBalance < totalPen ? round2(totalPen - payFromBalance) : 0,
    plans,
    cycleTransactions: (txs ?? []) as unknown as TransactionRow[],
  };
}

export type CardOverview = NonNullable<Awaited<ReturnType<typeof getCardOverview>>>;
