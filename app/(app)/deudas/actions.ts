"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/(app)/actions";
import { requireUser } from "@/lib/auth";
import { fromLimaDateTimeLocal, limaDateKey } from "@/lib/dates";
import { round2 } from "@/lib/finance";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

const num = z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))), z.number().positive("Monto inválido"));
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))), z.number().positive().optional());

const paymentSchema = z.object({
  debt_id: z.uuid(),
  amount: num, // en la moneda de la deuda
  account_id: z.uuid({ error: "Elige la cuenta" }),
  fx_rate: optNum,
  occurred_at: z.string().optional().default(""),
});

/** Tipo de cambio para una deuda en US$ pagada en soles: el del día o el último guardado. */
async function fxFor(supabase: DB, date: string, manual?: number) {
  if (manual) return manual;
  const { data } = await supabase.from("fx_rates").select("usd_pen").lte("date", date).order("date", { ascending: false }).limit(1).maybeSingle();
  if (data) return Number(data.usd_pen);
  const { data: s } = await supabase.from("settings").select("value").eq("key", "projection").maybeSingle();
  return ((s?.value as { fx?: number }) ?? {}).fx ?? null;
}

/** Aplica un pago a la deuda: baja el saldo y avanza las cuotas si corresponde. */
async function applyToDebt(supabase: DB, debtId: string, amountInDebtCurrency: number, transactionId: string, paidAt: string) {
  const { data: d } = await supabase.from("debts").select("*").eq("id", debtId).single();
  if (!d) return;
  const balance = Math.max(0, round2(Number(d.balance) - amountInDebtCurrency));
  const finished = balance <= 0.005;
  const isInstallment = !finished && d.installment_amount && amountInDebtCurrency + 0.005 >= Number(d.installment_amount);
  await supabase.from("debt_payments").insert({ debt_id: debtId, transaction_id: transactionId, amount: amountInDebtCurrency, currency: d.currency, paid_at: paidAt });
  let next = d.next_due_date;
  if (isInstallment && next) {
    const n = new Date(`${next}T12:00:00Z`);
    n.setUTCMonth(n.getUTCMonth() + 1);
    next = n.toISOString().slice(0, 10);
  }
  await supabase
    .from("debts")
    .update({
      balance,
      installments_paid: finished && d.installments_total ? d.installments_total : d.installments_paid + (isInstallment ? 1 : 0),
      next_due_date: finished ? null : next,
    })
    .eq("id", debtId);
}

export async function registerDebtPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, fieldErrors, message: "Revisa los datos" };
  }
  const v = parsed.data;
  const { data: debt } = await supabase.from("debts").select("name, currency, creditor_person_id").eq("id", v.debt_id).single();
  if (!debt) return { ok: false, message: "Deuda no encontrada" };
  const when = v.occurred_at ? fromLimaDateTimeLocal(v.occurred_at) : new Date();
  let fx: number | null = null;
  if (debt.currency === "USD") {
    fx = await fxFor(supabase, limaDateKey(when), v.fx_rate);
    if (!fx) return { ok: false, fieldErrors: { fx_rate: "Falta el tipo de cambio" }, message: "Revisa los datos" };
  }
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      occurred_at: when.toISOString(),
      amount: v.amount,
      currency: debt.currency,
      fx_rate: fx,
      amount_pen: fx ? round2(v.amount * fx) : v.amount,
      account_id: v.account_id,
      type: "pago_deuda",
      merchant: debt.name,
      person_id: debt.creditor_person_id,
      source: "manual",
      status: "confirmado",
    })
    .select("id")
    .single();
  if (error || !tx) return { ok: false, message: "No se pudo guardar" };
  await applyToDebt(supabase, v.debt_id, v.amount, tx.id, when.toISOString());
  revalidatePath("/", "layout");
  return { ok: true, savedAt: Date.now(), message: `Pago registrado: ${debt.name}` };
}

/** SPEC 11: "¿Es un pago de tu deuda con NOMBRE?" — convierte un Plin/transferencia en pago de deuda. */
export async function convertToDebtPayment(transactionId: string, debtId: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  const [{ data: tx }, { data: debt }] = await Promise.all([
    supabase.from("transactions").select("amount_pen, occurred_at, type").eq("id", transactionId).single(),
    supabase.from("debts").select("name, currency, creditor_person_id").eq("id", debtId).single(),
  ]);
  if (!tx || !debt || tx.type !== "gasto") return { ok: false, message: "No se pudo convertir" };
  let amountInDebt = Number(tx.amount_pen);
  if (debt.currency === "USD") {
    const fx = await fxFor(supabase, tx.occurred_at.slice(0, 10));
    if (!fx) return { ok: false, message: "Falta el tipo de cambio (ponlo en Ajustes)" };
    amountInDebt = round2(amountInDebt / fx);
  }
  await supabase
    .from("transactions")
    .update({ type: "pago_deuda", category_id: null, status: "confirmado", person_id: debt.creditor_person_id, tags: [] })
    .eq("id", transactionId);
  await applyToDebt(supabase, debtId, amountInDebt, transactionId, tx.occurred_at);
  revalidatePath("/", "layout");
  return { ok: true, message: `Registrado como pago a ${debt.name}` };
}
