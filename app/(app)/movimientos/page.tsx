import type { Metadata } from "next";
import Link from "next/link";
import { TransactionFilters, type FilterOptions } from "@/components/transactions/filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { UnparsedEmails } from "@/components/transactions/unparsed-emails";
import { requireUser } from "@/lib/auth";
import { currentYearMonth, monthRange, parseYearMonth, yearMonthKey, type YearMonth } from "@/lib/dates";
import { countPendingReview, getCatalogs, getMonthSummary, getUnparsedEmails, REVIEW_FILTER, TRANSACTION_SELECT } from "@/lib/data";
import { formatMonth, formatPEN } from "@/lib/format";
import type { TransactionRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimientos · FLIP" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function MovementsPage({ searchParams }: PageProps<"/movimientos">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const reviewTab = get("vista") === "por_revisar";
  const ym = parseYearMonth(get("mes")) ?? currentYearMonth();
  const account = get("cuenta");
  const category = get("categoria");
  const tag = get("etiqueta");
  // Quita caracteres que PostgREST interpreta en los filtros or().
  const q = get("q")?.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

  const catalogs = await getCatalogs(supabase);
  let query = supabase.from("transactions").select(TRANSACTION_SELECT).order("occurred_at", { ascending: false });
  if (reviewTab) {
    query = query.or(REVIEW_FILTER); // todos los meses
  } else {
    const { start, end } = monthRange(ym);
    query = query.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString());
  }
  if (account && UUID.test(account)) query = query.or(`account_id.eq.${account},counterpart_account_id.eq.${account}`);
  if (category && UUID.test(category)) query = query.eq("category_id", category);
  if (tag && /^[a-z0-9_]+$/.test(tag)) query = query.contains("tags", [tag]);
  if (q) query = query.or(`merchant.ilike.%${q}%,note.ilike.%${q}%`);

  const [{ data }, pending, summary, unparsed] = await Promise.all([
    query.limit(500),
    countPendingReview(supabase),
    reviewTab ? null : getMonthSummary(supabase, ym, catalogs),
    reviewTab ? getUnparsedEmails(supabase) : [],
  ]);
  const transactions = (data ?? []) as unknown as TransactionRow[];

  const options: FilterOptions = {
    months: lastMonths(currentYearMonth(), 12).map((m) => ({
      value: yearMonthKey(m),
      label: capitalize(formatMonth(m.year, m.month)),
    })),
    accounts: catalogs.accounts,
    categories: catalogs.categories,
    tags: catalogs.tags,
  };

  const filtersParams = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "vista" && typeof v === "string") as [string, string][]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{reviewTab ? "Todos los meses" : capitalize(formatMonth(ym.year, ym.month))}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Movimientos</h1>
        </div>
        {summary && (
          <p className="tabular text-sm text-muted-foreground">
            Gastaste <span className="text-foreground">{formatPEN(summary.spending)}</span> · Entró{" "}
            <span className="text-income">{formatPEN(summary.income)}</span>
          </p>
        )}
      </header>

      <nav className="flex gap-1 rounded-xl bg-muted p-1 sm:w-fit" aria-label="Vista">
        <Tab href={`/movimientos?${filtersParams}`} active={!reviewTab}>
          Todos
        </Tab>
        <Tab href={`/movimientos?${new URLSearchParams([...filtersParams, ["vista", "por_revisar"]])}`} active={reviewTab}>
          Por revisar
          <span className={cn("ml-2 rounded-full px-2 text-xs", pending > 0 ? "bg-amber-400 text-black" : "bg-background")}>{pending}</span>
        </Tab>
      </nav>

      {reviewTab && (
        <p className="text-sm text-muted-foreground">
          Movimientos que FLIP no pudo decidir solo, o que llegaron sin categoría. Tócalos para confirmarlos.
        </p>
      )}

      <UnparsedEmails emails={unparsed} />

      <TransactionFilters options={options} />

      {transactions.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {reviewTab ? (unparsed.length ? "No hay movimientos por revisar." : "No hay nada por revisar. 🎉") : "No hay movimientos con estos filtros."}
        </p>
      ) : (
        <TransactionList transactions={transactions} />
      )}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium sm:flex-none",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function lastMonths(from: YearMonth, count: number): YearMonth[] {
  const out: YearMonth[] = [];
  let { year, month } = from;
  for (let i = 0; i < count; i++) {
    out.push({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
