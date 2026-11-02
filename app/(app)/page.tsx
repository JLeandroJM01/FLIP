import { AlertCircle, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { AccountsCard } from "@/components/home/accounts-card";
import { QuickActions } from "@/components/home/quick-actions";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { currentYearMonth, limaDateKey, limaParts } from "@/lib/dates";
import { countPendingReview, getAccountBalances, getCatalogs, getMonthSummary, getNextSalaryPayment, getRecentTransactions, getSetting } from "@/lib/data";
import { formatMonth, formatPEN, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio · FLIP" };

export default async function HomePage() {
  const { supabase } = await requireUser();
  const now = new Date();
  const ym = currentYearMonth(now);
  const catalogs = await getCatalogs(supabase);
  const [summary, recent, pending, budget, balances, nextSalary] = await Promise.all([
    getMonthSummary(supabase, ym, catalogs),
    getRecentTransactions(supabase, 5),
    countPendingReview(supabase),
    getSetting<number>(supabase, "monthly_budget", 1500),
    getAccountBalances(supabase, catalogs),
    getNextSalaryPayment(supabase, limaDateKey(now)),
  ]);

  const cashAccountId = catalogs.accounts.find((a) => a.type === "billetera")?.id;
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const daysLeft = daysInMonth - limaParts(now).day + 1;
  const spentPct = budget > 0 ? Math.min(100, Math.max(0, (summary.spending / budget) * 100)) : 0;
  const left = budget - summary.spending;
  const topCategories = [...summary.byCategory.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({ category: catalogs.categories.find((c) => c.id === id), amount }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatMonth(ym.year, ym.month)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
      </header>

      <QuickActions cashAccountId={cashAccountId} />

      {pending > 0 && (
        <Link
          href="/movimientos?vista=por_revisar"
          className="flex min-h-11 items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <AlertCircle className="size-5 text-amber-400" />
          <span className="flex-1">
            Tienes <strong>{pending}</strong> {pending === 1 ? "movimiento" : "movimientos"} por revisar
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Neto del mes</CardDescription>
            <CardTitle className={cn("tabular text-3xl", summary.net >= 0 ? "text-income" : "text-destructive")}>
              {formatPEN(summary.net)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Entró</p>
              <p className="tabular font-medium">{formatPEN(summary.income)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gastaste</p>
              <p className="tabular font-medium">{formatPEN(summary.spending)}</p>
            </div>
            {nextSalary && (
              <p className="col-span-2 text-xs text-muted-foreground">
                Próximo sueldo: <span className="text-foreground">{formatShortDate(`${nextSalary.date}T12:00:00-05:00`)}</span> ·{" "}
                <span className="tabular text-income">{formatPEN(nextSalary.amount)}</span> (estimado, se registra solo)
              </p>
            )}
            {summary.reimbursements > 0 && (
              <p className="col-span-2 text-xs text-muted-foreground">
                Ya descontados {formatPEN(summary.reimbursements)} que te yapearon.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Gastado vs presupuesto</CardDescription>
            <CardTitle className="tabular text-3xl">
              {formatPEN(summary.spending)}
              <span className="text-base font-normal text-muted-foreground"> de {formatPEN(budget)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Presupuesto usado"
              aria-valuenow={Math.round(spentPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn("h-full rounded-full", spentPct >= 100 ? "bg-destructive" : spentPct >= 80 ? "bg-amber-400" : "bg-primary")}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {left >= 0 ? (
                <>
                  Te quedan <span className="tabular text-foreground">{formatPEN(left)}</span> para {daysLeft}{" "}
                  {daysLeft === 1 ? "día" : "días"}
                </>
              ) : (
                <>
                  Te pasaste por <span className="tabular text-destructive">{formatPEN(-left)}</span>
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>En qué se fue</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay gastos este mes.</p>
            ) : (
              <ul className="space-y-3">
                {topCategories.map(({ category, amount }) => (
                  <li key={category?.id ?? "sin"} className="flex items-center gap-3 text-sm">
                    <CategoryIcon icon={category?.icon} color={category?.color} size="sm" />
                    <span className="flex-1 truncate">{category?.name ?? "Sin categoría"}</span>
                    <span className="tabular font-medium">{formatPEN(amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <AccountsCard accounts={catalogs.accounts} balances={balances} />

        <section className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Últimos movimientos</h2>
            <Link href="/movimientos" className="flex min-h-11 items-center text-sm text-primary">
              Ver todos
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no hay movimientos. Usa <strong className="text-foreground">+</strong> para registrar el primero.
            </p>
          ) : (
            <TransactionList transactions={recent} grouped={false} compact />
          )}
        </section>

        <Card className="border-dashed bg-transparent">
          <CardHeader>
            <CardDescription>Próximamente (Fase 3)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>A pagar tarjeta el 5 (estimado del ciclo)</p>
            <p>Te deben</p>
            <p>Progreso de deudas</p>
            <p>Meta del depa</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
