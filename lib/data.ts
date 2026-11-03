import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentYearMonth, monthRange, yearMonthKey, type YearMonth } from "@/lib/dates";
import {
  accountBalances,
  DEFAULT_AFP_RATES,
  monthlySummary,
  monthlyTaxFor,
  salaryPaymentsOn,
  type AfpRates,
  type BalanceTx,
  type PayItem,
  type SalaryPayment,
  type SummaryTx,
} from "@/lib/finance";
import type { Database } from "@/lib/supabase/database.types";
import type { Catalogs, DefaultAccounts, OwedItem, TransactionRow } from "@/lib/types";

type DB = SupabaseClient<Database>;

export const TRANSACTION_SELECT =
  "*, account:accounts!transactions_account_id_fkey(id, name, type), category:categories(id, name, icon, color), person:people(id, name), shared:shared_expenses!transactions_shared_expense_id_fkey(total, my_share)";

async function getCatalogsImpl(supabase: DB): Promise<Catalogs> {
  const [accounts, categories, people, tags, defaults, owed, creditors] = await Promise.all([
    supabase.from("accounts").select("*").order("sort_order"),
    supabase.from("categories").select("*").order("kind").order("sort_order"),
    supabase.from("people").select("*").order("name"),
    supabase.from("tags").select("*").order("name"),
    supabase.from("settings").select("value").eq("key", "default_accounts").maybeSingle(),
    getOwed(supabase),
    supabase.from("debts").select("id, name, creditor_person_id").not("creditor_person_id", "is", null).gt("balance", 0),
  ]);
  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    people: people.data ?? [],
    tags: tags.data ?? [],
    defaultAccounts: (defaults.data?.value ?? {}) as DefaultAccounts,
    owed,
    creditorDebts: (creditors.data ?? []).map((d) => ({ debtId: d.id, personId: d.creditor_person_id!, name: d.name })),
  };
}

/** "Te deben" (SPEC 8): lo pendiente de cada persona en gastos compartidos, del más antiguo al más nuevo. */
export async function getOwed(supabase: DB): Promise<OwedItem[]> {
  const { data } = await supabase
    .from("shared_participants")
    .select("id, person_id, amount_owed, amount_paid, person:people(name), shared:shared_expenses(tx:transactions!shared_expenses_transaction_id_fkey(merchant, note, occurred_at, status))");
  const items: OwedItem[] = [];
  for (const p of data ?? []) {
    const pending = Number(p.amount_owed) - Number(p.amount_paid);
    const tx = (p.shared as { tx: { merchant: string | null; note: string | null; occurred_at: string; status: string } | null } | null)?.tx;
    if (pending <= 0.005 || !tx || tx.status === "anulado") continue;
    items.push({
      participantId: p.id,
      personId: p.person_id,
      personName: (p.person as { name: string } | null)?.name ?? "",
      merchant: tx.merchant || tx.note || "Gasto compartido",
      occurredAt: tx.occurred_at,
      pending: Math.round(pending * 100) / 100,
    });
  }
  return items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** Gastos recientes que conviene preguntar "¿Fue compartido?" (SPEC 8: Comida/Delivery/Salidas ≥ S/ 60). */
export async function getSharedPrompts(supabase: DB, catalogs: Catalogs) {
  const settings = await getSettings(supabase);
  const threshold = Number(settings.shared_prompt_threshold ?? 60);
  const names = (settings.shared_prompt_categories ?? ["Comida", "Delivery", "Salidas"]) as string[];
  const categoryIds = catalogs.categories.filter((c) => c.kind === "gasto" && names.includes(c.name)).map((c) => c.id);
  if (!categoryIds.length) return [];
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("type", "gasto")
    .neq("status", "anulado")
    .is("shared_expense_id", null)
    .eq("shared_dismissed", false)
    .in("category_id", categoryIds)
    .gte("amount_pen", threshold)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(3);
  return (data ?? []) as unknown as TransactionRow[];
}

export async function getSetting<T>(supabase: DB, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

async function getSettingsImpl(supabase: DB): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("settings").select("key, value");
  return Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
}

export async function getRecentTransactions(supabase: DB, limit: number) {
  const { data } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .neq("status", "anulado")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as TransactionRow[];
}

/**
 * "Por revisar" (SPEC 1): los movimientos que la app no pudo decidir (status por_revisar) y
 * los gastos/ingresos confirmados que llegaron sin categoría (cuentan en los totales, pero
 * falta ponerles categoría).
 */
export const REVIEW_FILTER =
  "status.eq.por_revisar,and(status.eq.confirmado,category_id.is.null,type.in.(gasto,ingreso))";

async function countPendingReviewImpl(supabase: DB): Promise<number> {
  const [{ count }, { count: emails }] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).or(REVIEW_FILTER),
    supabase.from("raw_emails").select("id", { count: "exact", head: true }).in("parse_status", ["desconocido", "error"]),
  ]);
  return (count ?? 0) + (emails ?? 0);
}

/** Correos que la app no entendió o no pudo guardar (SPEC 1: nunca se pierden). */
export async function getUnparsedEmails(supabase: DB) {
  const { data } = await supabase
    .from("raw_emails")
    .select("id, subject, received_at, parse_status, error")
    .in("parse_status", ["desconocido", "error"])
    .order("received_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Resumen del mes con las reglas de lib/finance/monthly-summary (efectivo, reembolsos…). */
export async function getMonthSummary(supabase: DB, ym: YearMonth, catalogs: Catalogs) {
  const { start, end } = monthRange(ym);
  const cashAccountIds = catalogs.accounts.filter((a) => a.type === "billetera").map((a) => a.id);
  const cashCategoryId =
    catalogs.categories.find((c) => c.kind === "gasto" && c.name === "Efectivo")?.id ?? null;

  const [month, before] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, status, amount_pen, category_id, account_id, shared_expense_id, shared:shared_expenses!transactions_shared_expense_id_fkey(total, my_share)")
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString()),
    // Efectivo acumulado antes del mes: retiros y gastos pagados en efectivo.
    supabase
      .from("transactions")
      .select("type, amount_pen, account_id")
      .eq("status", "confirmado")
      .lt("occurred_at", start.toISOString())
      .or(
        cashAccountIds.length
          ? `type.eq.retiro_efectivo,and(type.eq.gasto,account_id.in.(${cashAccountIds.join(",")}))`
          : "type.eq.retiro_efectivo",
      ),
  ]);

  const isCash = (accountId: string) => cashAccountIds.includes(accountId);
  const illiquidIds = catalogs.accounts.filter((a) => a.type === "activo").map((a) => a.id);
  const cashTotalsBefore = { withdrawals: 0, cashExpenses: 0 };
  for (const t of before.data ?? []) {
    if (t.type === "retiro_efectivo") cashTotalsBefore.withdrawals += Number(t.amount_pen);
    else if (isCash(t.account_id)) cashTotalsBefore.cashExpenses += Number(t.amount_pen);
  }

  const transactions: SummaryTx[] = (month.data ?? []).map((t) => {
    const shared = t.shared as { total: number; my_share: number } | null;
    return {
      type: t.type,
      status: t.status,
      amountPen: Number(t.amount_pen),
      categoryId: t.category_id,
      paidInCash: isCash(t.account_id),
      othersShare: t.type === "gasto" && shared ? Number(shared.total) - Number(shared.my_share) : 0,
      paysSharedExpense: t.type === "reembolso" && !!t.shared_expense_id,
      illiquid: illiquidIds.includes(t.account_id),
    };
  });

  return monthlySummary({ transactions, cashTotalsBefore, cashCategoryId });
}

/** Saldo actual por cuenta (null = sin saldo inicial). Ver lib/finance/balances. */
async function getAccountBalancesImpl(supabase: DB, catalogs: Catalogs) {
  const withOpening = catalogs.accounts.filter((a) => a.opening_balance_at);
  if (withOpening.length === 0) return accountBalances([], []);
  const since = withOpening.map((a) => a.opening_balance_at!).sort()[0];
  const { data } = await supabase
    .from("transactions")
    .select("type, status, occurred_at, amount, currency, amount_pen, account_id, counterpart_account_id")
    .eq("status", "confirmado")
    .gte("occurred_at", since);
  const transactions: BalanceTx[] = (data ?? []).map((t) => ({
    type: t.type,
    status: t.status,
    occurredAt: t.occurred_at,
    amount: Number(t.amount),
    currency: t.currency,
    amountPen: Number(t.amount_pen),
    accountId: t.account_id,
    counterpartAccountId: t.counterpart_account_id,
  }));
  return accountBalances(
    catalogs.accounts.map((a) => ({
      id: a.id,
      currency: a.currency,
      openingBalance: a.opening_balance === null ? null : Number(a.opening_balance),
      openingBalanceAt: a.opening_balance_at,
    })),
    transactions,
  );
}

/** Próximo pago de sueldo que FLIP registrará solo (SPEC 9.5), mirando 45 días adelante. */
export async function getNextSalaryPayment(supabase: DB, today: string): Promise<SalaryPayment | null> {
  const [{ data: profile }, settings] = await Promise.all([
    supabase.from("income_profile").select("*").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    getSettings(supabase),
  ]);
  if (!profile) return null;
  const taxByPeriod = (settings.monthly_tax_estimate ?? {}) as Record<string, number>;
  const salary = {
    startDate: profile.start_date,
    endDate: profile.end_date,
    monthlyGross: Number(profile.monthly_gross),
    paySchedule: profile.pay_schedule as PayItem[],
    afpRates: { ...DEFAULT_AFP_RATES, ...((settings.afp_rates ?? {}) as Partial<AfpRates>) },
  };
  const tax = (ym: string) => monthlyTaxFor(ym, taxByPeriod);
  for (let i = 0; i <= 45; i++) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const [pay] = salaryPaymentsOn(d.toISOString().slice(0, 10), salary, tax);
    if (pay) return pay;
  }
  return null;
}

// Memorizadas por request (React cache): el layout y la página no repiten las mismas consultas.
export const getCatalogs = cache(getCatalogsImpl);
export const getSettings = cache(getSettingsImpl);
export const getAccountBalances = cache(getAccountBalancesImpl);
export const countPendingReview = cache(countPendingReviewImpl);

/** Gasto por categoría de los últimos `count` meses (mismas reglas que el resumen del mes). */
export const getCategorySeries = cache(async function getCategorySeries(supabase: DB, catalogs: Catalogs, count = 6) {
  const now = currentYearMonth();
  const months: YearMonth[] = [];
  let { year, month } = now;
  for (let i = 0; i < count; i++) {
    months.unshift({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  const first = monthRange(months[0]);
  const last = monthRange(months.at(-1)!);
  const cashAccountIds = catalogs.accounts.filter((a) => a.type === "billetera").map((a) => a.id);
  const illiquidIds = catalogs.accounts.filter((a) => a.type === "activo").map((a) => a.id);
  const cashCategoryId = catalogs.categories.find((c) => c.kind === "gasto" && c.name === "Efectivo")?.id ?? null;

  const [all, before] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_at, type, status, amount_pen, category_id, account_id, shared_expense_id, shared:shared_expenses!transactions_shared_expense_id_fkey(total, my_share)")
      .gte("occurred_at", first.start.toISOString())
      .lt("occurred_at", last.end.toISOString())
      .limit(5000),
    supabase
      .from("transactions")
      .select("type, amount_pen, account_id")
      .eq("status", "confirmado")
      .lt("occurred_at", first.start.toISOString())
      .or(
        cashAccountIds.length
          ? `type.eq.retiro_efectivo,and(type.eq.gasto,account_id.in.(${cashAccountIds.join(",")}))`
          : "type.eq.retiro_efectivo",
      ),
  ]);
  let cashTotals = { withdrawals: 0, cashExpenses: 0 };
  for (const t of before.data ?? []) {
    if (t.type === "retiro_efectivo") cashTotals.withdrawals += Number(t.amount_pen);
    else cashTotals.cashExpenses += Number(t.amount_pen);
  }

  return months.map((ym) => {
    const { start, end } = monthRange(ym);
    const txs: SummaryTx[] = (all.data ?? [])
      .filter((t) => t.occurred_at >= start.toISOString() && t.occurred_at < end.toISOString())
      .map((t) => {
        const shared = t.shared as { total: number; my_share: number } | null;
        return {
          type: t.type,
          status: t.status,
          amountPen: Number(t.amount_pen),
          categoryId: t.category_id,
          paidInCash: cashAccountIds.includes(t.account_id),
          othersShare: t.type === "gasto" && shared ? Number(shared.total) - Number(shared.my_share) : 0,
          paysSharedExpense: t.type === "reembolso" && !!t.shared_expense_id,
          illiquid: illiquidIds.includes(t.account_id),
        };
      });
    const summary = monthlySummary({ transactions: txs, cashTotalsBefore: cashTotals, cashCategoryId });
    cashTotals = summary.cashTotalsAfter;
    return {
      ym: yearMonthKey(ym),
      total: summary.spending,
      byCategory: Object.fromEntries([...summary.byCategory.entries()].map(([k, v]) => [k ?? "sin", v])),
    };
  });
});
