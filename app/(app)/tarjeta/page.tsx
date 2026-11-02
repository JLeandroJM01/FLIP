import { AlertTriangle, CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { Field, SettingsForm } from "@/components/settings/settings-form";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getCardOverview } from "@/lib/card-data";
import { getAccountBalances, getCatalogs } from "@/lib/data";
import { limaDateKey } from "@/lib/dates";
import { formatMoney, formatPEN, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveCardStatement } from "./actions";

export const metadata: Metadata = { title: "Tarjeta · FLIP" };

const d = (iso: string) => formatShortDate(`${iso}T12:00:00-05:00`);

export default async function CardPage() {
  const { supabase } = await requireUser();
  const catalogs = await getCatalogs(supabase);
  const balances = await getAccountBalances(supabase, catalogs);
  const today = limaDateKey(new Date());
  const c = await getCardOverview(supabase, catalogs, balances, today);

  if (!c) {
    return <p className="p-6 text-muted-foreground">No hay una tarjeta de crédito en tus cuentas.</p>;
  }
  const pct = Math.min(100, Math.max(0, c.usedPct));
  const amount = (
    <>
      {formatPEN(c.estimate.pen)}
      {c.estimate.usd > 0 && <> + {formatMoney(c.estimate.usd, "USD")}</>}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{c.card.name}{c.card.last4 && ` ****${c.card.last4}`}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tarjeta</h1>
      </header>

      {c.daysToDue <= 5 && c.totalPen > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <p>
            {c.daysToDue === 0 ? "Hoy" : c.daysToDue === 1 ? "Mañana" : `En ${c.daysToDue} días`} pagas la tarjeta: <strong className="tabular">{amount}</strong>.
            Paga el <strong>total</strong>: si pagas solo el mínimo, lo que queda cobra intereses altos.
          </p>
        </div>
      )}
      {c.shortfall > 0 && c.payFrom && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>
            En tu {c.payFrom.name.toLowerCase()} hay {formatPEN(c.payFrom.balance ?? 0)}: te faltan{" "}
            <strong className="tabular">{formatPEN(c.shortfall)}</strong> para el pago del {d(c.due)}.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>A pagar el {d(c.due)}</CardDescription>
            <CardTitle className="tabular text-3xl">{amount}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {c.estimate.fromStatement ? (
              <p>Según {c.statementSource === "estado de cuenta" ? "tu estado de cuenta" : c.statementSource === "usuario" ? "lo que indicaste" : `el ${c.statementSource}`}.</p>
            ) : (
              <p>
                Estimado: consumos desde el {d(c.cycleStart)}
                {c.estimate.installmentsPen + c.estimate.installmentsUsd > 0 && " + cuotas del mes"}. Confírmalo con tu estado de cuenta.
              </p>
            )}
            <p>≈ {formatPEN(c.totalPen)} al tipo de cambio {c.fx.toFixed(3)}.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Línea usada</CardDescription>
            <CardTitle className="tabular text-3xl">
              {formatPEN(c.used)}
              <span className="text-base font-normal text-muted-foreground"> de {formatPEN(c.limit)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Línea usada" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full", pct > 80 ? "bg-destructive" : pct > 30 ? "bg-amber-400" : "bg-primary")} style={{ width: `${pct}%` }} />
              <div className="absolute inset-y-0 left-[30%] w-px bg-foreground/60" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">Usas el {Math.round(c.usedPct)}%. Meta: menos del 30% (mejor para tu historial).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Estado de cuenta</CardDescription>
            <CardTitle className="text-base">¿Ya te llegó? Pon el pago total del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm action={saveCardStatement} submitLabel="Guardar monto real">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Vence" name="due" type="date" defaultValue={c.due} />
                <Field label="S/" name="pen" inputMode="decimal" defaultValue={c.estimate.fromStatement ? String(c.estimate.pen) : ""} />
                <Field label="US$" name="usd" inputMode="decimal" defaultValue={c.estimate.fromStatement ? String(c.estimate.usd) : ""} />
              </div>
            </SettingsForm>
          </CardContent>
        </Card>
      </div>

      {c.plans.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Compras en cuotas</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {c.plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="tabular">
                  {formatMoney(p.amount, p.currency)} × {p.installments}
                </span>
                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                  {p.remaining > 0 ? `Quedan ${p.remaining} · próxima el ${d(p.nextDue!)}` : "Pagada"}
                  {p.notes?.match(/TEA [\d.]+%/) && ` · ${p.notes.match(/TEA [\d.]+%/)![0]}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs text-muted-foreground">Se pagan dentro del pago de la tarjeta cada día {c.card.payment_day ?? 5}.</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Consumos del ciclo (desde el {d(c.cycleStart)})</h2>
        {c.cycleTransactions.length ? (
          <TransactionList transactions={c.cycleTransactions} />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay consumos en este ciclo.</p>
        )}
      </section>
    </div>
  );
}
