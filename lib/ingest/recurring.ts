import "server-only";
// Sueldo automático (SPEC 9.5): el BCP no avisa el abono, así que FLIP lo registra en cada día de pago.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_AFP_RATES,
  incomeEventsInMonth,
  monthlyTaxFor,
  salaryPaymentsOn,
  type AfpRates,
  type IncomeCalendar,
  type IncomeEstimates,
  type IncomeProfileLite,
  type PayItem,
  type SalaryPayment,
} from "@/lib/finance";
import { formatMonth } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

const PART_LABELS: Record<SalaryPayment["part"], string> = {
  adelanto: "adelanto de",
  resto: "resto de",
  parcial: "días trabajados de",
  unico: "sueldo de",
};

/** Registra los pagos de sueldo de los últimos `lookbackDays` días que falten (si el cron se saltó un día). */
export async function registerSalaryPayments(db: DB, today: string, lookbackDays = 7) {
  const [{ data: profile }, { data: settings }, { data: category }] = await Promise.all([
    db.from("income_profile").select("*").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("settings").select("key, value").in("key", ["afp_rates", "monthly_tax_estimate", "default_accounts"]),
    db.from("categories").select("id").eq("kind", "ingreso").eq("name", "Sueldo").maybeSingle(),
  ]);
  if (!profile) return { registered: 0 };
  const get = (k: string) => settings?.find((s) => s.key === k)?.value as Record<string, unknown> | undefined;
  const taxByPeriod = (get("monthly_tax_estimate") ?? {}) as Record<string, number>;
  const accountId = (get("default_accounts") ?? {}).ingreso as string | undefined;
  if (!accountId) return { registered: 0 };

  // Último monto corregido por el usuario para cada tipo de pago (la boleta real manda).
  const { data: past } = await db
    .from("income_events")
    .select("note, expected_amount, tx:transactions(amount_pen, status)")
    .eq("kind", "sueldo")
    .order("expected_date", { ascending: false })
    .limit(12);
  const realAmount = (part: SalaryPayment["part"]) => {
    const e = past?.find((p) => p.note === part);
    const tx = e?.tx as { amount_pen: number; status: string } | null;
    return tx && tx.status === "confirmado" && Number(tx.amount_pen) !== Number(e!.expected_amount) ? Number(tx.amount_pen) : null;
  };

  const salary = {
    startDate: profile.start_date,
    endDate: profile.end_date,
    monthlyGross: Number(profile.monthly_gross),
    paySchedule: profile.pay_schedule as PayItem[],
    afpRates: { ...DEFAULT_AFP_RATES, ...(get("afp_rates") as Partial<AfpRates> | undefined) },
  };
  const tax = (ym: string) => monthlyTaxFor(ym, taxByPeriod);

  let registered = 0;
  for (let i = lookbackDays; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    for (const pay of salaryPaymentsOn(date, salary, tax, realAmount)) {
      const { data: exists } = await db.from("income_events").select("id").eq("kind", "sueldo").eq("expected_date", date).maybeSingle();
      if (exists) continue;
      const [y, m] = pay.covers.split("-").map(Number);
      const { data: tx, error } = await db
        .from("transactions")
        .insert({
          occurred_at: `${date}T09:00:00-05:00`,
          amount: pay.amount,
          currency: "PEN",
          amount_pen: pay.amount,
          account_id: accountId,
          type: "ingreso",
          category_id: category?.id ?? null,
          merchant: profile.employer,
          note: `Sueldo: ${PART_LABELS[pay.part]} ${formatMonth(y, m)} (estimado; corrígelo con el monto real)`,
          source: "recurrente",
          status: "confirmado",
        })
        .select("id")
        .single();
      if (error || !tx) continue;
      await db.from("income_events").insert({
        kind: "sueldo",
        expected_date: date,
        expected_amount: pay.amount,
        actual_transaction_id: tx.id,
        note: pay.part,
      });
      registered++;
    }
  }
  return { registered };
}

/** SPEC 16: el texto de los correos se borra a los 90 días; los datos extraídos se quedan. */
export async function purgeOldEmailBodies(db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("raw_emails")
    .update({ body: null })
    .lt("received_at", cutoff)
    .in("parse_status", ["ok", "ignorado"])
    .not("body", "is", null)
    .select("id");
  return { purged: data?.length ?? 0 };
}

/** Gratificación, CTS y utilidades en su fecha (SPEC 9, fechas del usuario en settings.income_calendar). */
export async function registerIncomeEvents(db: DB, today: string, lookbackDays = 7) {
  const [{ data: profile }, { data: settings }, { data: categories }, { data: accounts }] = await Promise.all([
    db.from("income_profile").select("*").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("settings").select("key, value").in("key", ["afp_rates", "income_calendar", "income_estimates", "default_accounts"]),
    db.from("categories").select("id, name").eq("kind", "ingreso"),
    db.from("accounts").select("id, name, type"),
  ]);
  if (!profile) return { registered: 0 };
  const get = <T>(k: string) => settings?.find((s) => s.key === k)?.value as T | undefined;
  const calendar = get<IncomeCalendar>("income_calendar");
  const estimates = get<IncomeEstimates>("income_estimates");
  const mainAccount = (get<Record<string, string>>("default_accounts") ?? {}).ingreso;
  const ctsAccount = accounts?.find((a) => a.type === "activo" && a.name.toLowerCase().includes("cts"))?.id;
  if (!calendar || !estimates || !mainAccount) return { registered: 0 };
  const category = (name: string) => categories?.find((c) => c.name === name)?.id ?? null;
  const CATEGORY: Record<string, string> = { gratificacion: "Gratificación", cts: "CTS", utilidades: "Utilidades", asignacion_vacacional: "Asignación vacacional", otro: "Otro" };

  const income: IncomeProfileLite = {
    startDate: profile.start_date,
    endDate: profile.end_date,
    monthlyGross: Number(profile.monthly_gross),
    gratDaysBase: profile.grat_days_base,
    gratBonusRate: Number(profile.grat_bonus_rate),
    profitSharingSalaries: Number(profile.profit_sharing_salaries),
    afpRates: { ...DEFAULT_AFP_RATES, ...(get<Partial<AfpRates>>("afp_rates") ?? {}) },
  };

  let registered = 0;
  for (let i = lookbackDays; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const [y, m] = date.split("-").map(Number);
    for (const e of incomeEventsInMonth(y, m, income, calendar, estimates)) {
      if (e.dayUnknown || e.date !== date) continue; // sin día exacto: se registra a mano cuando llegue
      const accountId = e.kind === "cts" ? ctsAccount : mainAccount;
      if (!accountId) continue;
      const { data: exists } = await db.from("income_events").select("id").eq("kind", e.kind).eq("expected_date", date).maybeSingle();
      if (exists) continue;
      const { data: tx, error } = await db
        .from("transactions")
        .insert({
          occurred_at: `${date}T09:00:00-05:00`,
          amount: e.amount,
          currency: "PEN",
          amount_pen: e.amount,
          account_id: accountId,
          type: "ingreso",
          category_id: category(CATEGORY[e.kind]),
          merchant: profile.employer,
          note: `${e.label} (estimado; corrígelo con el monto real)`,
          source: "recurrente",
          status: "confirmado",
        })
        .select("id")
        .single();
      if (error || !tx) continue;
      await db.from("income_events").insert({ kind: e.kind, expected_date: date, expected_amount: e.amount, actual_transaction_id: tx.id, note: e.label });
      registered++;
    }
  }
  return { registered };
}

/** Cuotas con cobro automático (crédito Yape, día 28): pago_deuda desde su cuenta y baja el saldo. */
export async function registerAutoDebits(db: DB, today: string) {
  const { data: debts } = await db
    .from("debts")
    .select("*")
    .not("auto_debit_account_id", "is", null)
    .not("next_due_date", "is", null)
    .lte("next_due_date", today);
  let registered = 0;
  for (const d of debts ?? []) {
    let due = d.next_due_date!;
    let paid = d.installments_paid;
    let balance = Number(d.balance);
    while (due <= today && d.installment_amount && (!d.installments_total || paid < d.installments_total)) {
      const amount = Math.min(Number(d.installment_amount), balance);
      const { data: tx } = await db
        .from("transactions")
        .insert({
          occurred_at: `${due}T09:00:00-05:00`,
          amount,
          currency: d.currency,
          amount_pen: amount,
          account_id: d.auto_debit_account_id!,
          type: "pago_deuda",
          merchant: d.name,
          note: `Cuota ${paid + 1}${d.installments_total ? ` de ${d.installments_total}` : ""} (cobro automático)`,
          source: "recurrente",
          status: "confirmado",
        })
        .select("id")
        .single();
      const { error } = await db
        .from("debt_payments")
        .insert({ debt_id: d.id, transaction_id: tx?.id ?? null, amount, currency: d.currency, paid_at: `${due}T09:00:00-05:00`, due_date: due });
      if (error && tx) {
        await db.from("transactions").delete().eq("id", tx.id); // ya estaba registrada
        break;
      }
      paid += 1;
      balance = Math.max(0, balance - amount);
      registered++;
      const next = new Date(`${due}T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      due = next.toISOString().slice(0, 10);
    }
    const finished = !!d.installments_total && paid >= d.installments_total;
    await db
      .from("debts")
      .update({ installments_paid: paid, balance: finished ? 0 : balance, next_due_date: finished ? null : due })
      .eq("id", d.id);
  }
  return { registered };
}
