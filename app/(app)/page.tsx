import { AlertCircle, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { AccountsCard } from "@/components/home/accounts-card";
import { CategoryChart } from "@/components/home/category-chart";
import { OwedCard } from "@/components/home/owed-card";
import { SharedPrompts } from "@/components/home/shared-prompts";
import { QuickActions } from "@/components/home/quick-actions";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { currentYearMonth, limaDateKey, limaParts } from "@/lib/dates";
import { getCardOverview } from "@/lib/card-data";
import {
  countPendingReview,
  getAccountBalances,
  getCatalogs,
  getCategorySeries,
  getMonthSummary,
  getNextSalaryPayment,
  getRecentTransactions,
  getSetting,
  getSharedPrompts,
} from "@/lib/data";
import { buildProjectionInput, downPaymentAvailable, project } from "@/lib/finance";
import { loadProjectionContext } from "@/lib/projection-data";
import { formatMoney, formatMonth, formatPEN, formatShortDate } from "@/lib/format";
import type { Catalogs } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio · FLIP" };

export default async function HomePage() {
  const { supabase } = await requireUser();
  const now = new Date();
  const ym = currentYearMonth(now);
  const catalogs = await getCatalogs(supabase);
  const today = limaDateKey(now);
  // Lo de arriba (rápido) en paralelo; tarjeta, deudas, meta y gráfico se transmiten después (Suspense).
  const [summary, recent, pending, budget, balances, nextSalary, prompts] = await Promise.all([
    getMonthSummary(supabase, ym, catalogs),
    getRecentTransactions(supabase, 5),
    countPendingReview(supabase),
    getSetting<number>(supabase, "monthly_budget", 1500),
    getAccountBalances(supabase, catalogs),
    getNextSalaryPayment(supabase, today),
    getSharedPrompts(supabase, catalogs),
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

      <SharedPrompts transactions={prompts} />

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

        <OwedCard owed={catalogs.owed} today={today} />

        <Suspense fallback={<CardSkeletons count={3} />}>
          <PlanCards catalogs={catalogs} balances={balances} today={today} />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-xl border bg-card" />
            <div className="h-80 animate-pulse rounded-xl border bg-card" />
          </div>
        }
      >
        <CategorySection catalogs={catalogs} />
      </Suspense>
    </div>
  );
}

function CardSkeletons({ count }: { count: number }) {
  return Array.from({ length: count }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-xl border bg-card" />);
}

/** Tarjeta, deudas y meta del depa (usan la proyección: se transmiten después de lo principal). */
async function PlanCards({ catalogs, balances, today }: { catalogs: Catalogs; balances: Map<string, number | null>; today: string }) {
  const { supabase } = await requireUser();
  const [card, ctx, projectionSettings, depa] = await Promise.all([
    getCardOverview(supabase, catalogs, balances, today),
    loadProjectionContext(supabase, catalogs, today),
    getSetting<{ living?: number }>(supabase, "projection", {}),
    getSetting<{ price: number; down_pct: number; closing_pct: number }>(supabase, "depa", { price: 400000, down_pct: 0.3, closing_pct: 0.02 }),
  ]);
  const plan = ctx ? project(buildProjectionInput(ctx, { living: projectionSettings.living ?? 1500, bonusSalaries: 0 })) : null;
  const goalTarget = depa.price * (depa.down_pct + depa.closing_pct);
  const goalNow = plan ? downPaymentAvailable(plan.months[0]) : 0;
  const goalMonth = plan?.months.find((m) => downPaymentAvailable(m) >= goalTarget)?.ym;
  const monthLabel = (ym: string) => formatMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  return (
    <>
        {card && (
          <Link href="/tarjeta" className="block">
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardDescription>A pagar tarjeta el {formatShortDate(`${card.due}T12:00:00-05:00`)}</CardDescription>
                <CardTitle className="tabular text-3xl">
                  {formatPEN(card.estimate.pen)}
                  {card.estimate.usd > 0 && <span className="text-xl"> + {formatMoney(card.estimate.usd, "USD")}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {card.daysToDue === 0 ? "Hoy" : `En ${card.daysToDue} ${card.daysToDue === 1 ? "día" : "días"}`} ·{" "}
                {card.estimate.fromStatement ? "monto conocido" : "estimado del ciclo"}
                {card.shortfall > 0 && <span className="text-destructive"> · te faltan {formatPEN(card.shortfall)}</span>}
              </CardContent>
            </Card>
          </Link>
        )}


        {plan && (
          <Link href="/deudas" className="block">
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardDescription>Sin deudas desde</CardDescription>
                <CardTitle className="text-3xl text-primary first-letter:uppercase">
                  {plan.debtFreeMonth ? monthLabel(plan.debtFreeMonth) : "después de nov 2029"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Te quedan {formatPEN(plan.months[0].debtsLeft)} por pagar (sin contar los consumos nuevos de la tarjeta).
              </CardContent>
            </Card>
          </Link>
        )}

        {plan && (
          <Link href="/metas" className="block">
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardDescription>Meta del depa (inicial {Math.round(depa.down_pct * 100)}%)</CardDescription>
                <CardTitle className="tabular text-3xl">
                  {formatPEN(goalNow)}
                  <span className="text-base font-normal text-muted-foreground"> de {formatPEN(goalTarget)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance de la meta del depa" aria-valuenow={Math.round((goalNow / goalTarget) * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (goalNow / goalTarget) * 100)}%` }} />
                </div>
                <p className="text-sm text-muted-foreground first-letter:uppercase">
                  {goalMonth ? `Llegas en ${monthLabel(goalMonth)}` : "Después de nov 2029 a este ritmo"}
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
    </>
  );
}

/** Gráfico de gasto por categoría (últimos 6 meses). */
async function CategorySection({ catalogs }: { catalogs: Catalogs }) {
  const { supabase } = await requireUser();
  const months = await getCategorySeries(supabase, catalogs, 6);
  return <CategoryChart months={months} categories={catalogs.categories} />;
}
