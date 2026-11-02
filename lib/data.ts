import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange, type YearMonth } from "@/lib/dates";
import { accountBalances, monthlySummary, type BalanceTx, type SummaryTx } from "@/lib/finance";
import type { Database } from "@/lib/supabase/database.types";
import type { Catalogs, DefaultAccounts, TransactionRow } from "@/lib/types";

type DB = SupabaseClient<Database>;

export const TRANSACTION_SELECT =
  "*, account:accounts!transactions_account_id_fkey(id, name, type), category:categories(id, name, icon, color), person:people(id, name)";

export async function getCatalogs(supabase: DB): Promise<Catalogs> {
  const [accounts, categories, people, tags, defaults] = await Promise.all([
    supabase.from("accounts").select("*").order("sort_order"),
    supabase.from("categories").select("*").order("kind").order("sort_order"),
    supabase.from("people").select("*").order("name"),
    supabase.from("tags").select("*").order("name"),
    supabase.from("settings").select("value").eq("key", "default_accounts").maybeSingle(),
  ]);
  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    people: people.data ?? [],
    tags: tags.data ?? [],
    defaultAccounts: (defaults.data?.value ?? {}) as DefaultAccounts,
  };
}

export async function getSetting<T>(supabase: DB, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

export async function getSettings(supabase: DB): Promise<Record<string, unknown>> {
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

export async function countPendingReview(supabase: DB): Promise<number> {
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "por_revisar");
  return count ?? 0;
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
      .select("type, status, amount_pen, category_id, account_id")
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
  const cashTotalsBefore = { withdrawals: 0, cashExpenses: 0 };
  for (const t of before.data ?? []) {
    if (t.type === "retiro_efectivo") cashTotalsBefore.withdrawals += Number(t.amount_pen);
    else if (isCash(t.account_id)) cashTotalsBefore.cashExpenses += Number(t.amount_pen);
  }

  const transactions: SummaryTx[] = (month.data ?? []).map((t) => ({
    type: t.type,
    status: t.status,
    amountPen: Number(t.amount_pen),
    categoryId: t.category_id,
    paidInCash: isCash(t.account_id),
  }));

  return monthlySummary({ transactions, cashTotalsBefore, cashCategoryId });
}

/** Saldo actual por cuenta (null = sin saldo inicial). Ver lib/finance/balances. */
export async function getAccountBalances(supabase: DB, catalogs: Catalogs) {
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
