import { CreditCard, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DebtPaymentButton } from "@/components/debts/debt-payment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getCardOverview } from "@/lib/card-data";
import { getAccountBalances, getCatalogs, getSettings } from "@/lib/data";
import { limaDateKey } from "@/lib/dates";
import { buildProjectionInput, prepayment, project } from "@/lib/finance";
import { formatMoney, formatMonth, formatPEN } from "@/lib/format";
import { loadProjectionContext } from "@/lib/projection-data";

export const metadata: Metadata = { title: "Deudas · FLIP" };

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return formatMonth(y, m);
};

export default async function DebtsPage() {
  const { supabase } = await requireUser();
  const today = limaDateKey(new Date());
  const catalogs = await getCatalogs(supabase);
  const [balances, settings, { data: debtsRaw }, ctx] = await Promise.all([
    getAccountBalances(supabase, catalogs),
    getSettings(supabase),
    supabase.from("debts").select("*").order("payoff_order", { ascending: true, nullsFirst: false }),
    loadProjectionContext(supabase, catalogs, today),
  ]);
  const card = await getCardOverview(supabase, catalogs, balances, today);
  const living = Number(((settings.projection ?? {}) as { living?: number }).living ?? 1500);
  const plan = ctx ? project(buildProjectionInput(ctx, { living, bonusSalaries: 0 })) : null;
  const fx = card?.fx ?? 3.45;

  // La tarjeta y las compras en cuotas se pagan completas cada día 5 (van en la pantalla de Tarjeta).
  const debts = (debtsRaw ?? []).filter((d) => d.kind !== "tarjeta" && !d.external_op_id && Number(d.balance) > 0);
  const paid = (debtsRaw ?? []).filter((d) => d.kind !== "tarjeta" && !d.external_op_id && Number(d.balance) <= 0);
  const toPen = (amount: number, currency: string) => (currency === "USD" ? amount * fx : amount);
  const total = debts.reduce((s, d) => s + toPen(Number(d.balance), d.currency), 0) + (card?.used ?? 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Plan: Daniela → Walter → prepagar el crédito Yape. La tarjeta, siempre el pago total.</p>
        <h1 className="text-2xl font-semibold tracking-tight">Deudas</h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Quedas sin deudas en</CardDescription>
            <CardTitle className="text-3xl text-primary first-letter:uppercase">
              {plan?.debtFreeMonth ? monthLabel(plan.debtFreeMonth) : "más allá de nov 2029"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Con un gasto de vida de {formatPEN(living)} al mes y tus ingresos estimados. Cambia el gasto en Metas para ver otros escenarios.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Debes en total</CardDescription>
            <CardTitle className="tabular text-3xl">{formatPEN(total)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Incluye la línea usada de la tarjeta ({formatPEN(card?.used ?? 0)}). US$ a {fx.toFixed(3)}.</CardContent>
        </Card>
      </div>

      <ul className="space-y-3">
        {debts.map((d) => {
          const balance = Number(d.balance);
          const remaining = d.installments_total ? d.installments_total - d.installments_paid : 0;
          const progress = d.installments_total
            ? d.installments_paid / d.installments_total
            : d.original_amount
              ? 1 - balance / Number(d.original_amount)
              : 0;
          const prepay = remaining > 0 && d.installment_amount && d.tcea ? prepayment(remaining, Number(d.installment_amount), Number(d.tcea)) : null;
          const planned = plan?.paidOff[d.name];
          return (
            <li key={d.id}>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {d.payoff_order && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-xs text-primary">{d.payoff_order}°</span>}
                        {d.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.tcea && Number(d.tcea) > 0 ? `TCEA ${(Number(d.tcea) * 100).toFixed(0)}%` : "Sin interés"}
                        {remaining > 0 && ` · ${remaining} cuotas de ${formatMoney(Number(d.installment_amount), d.currency)}`}
                        {d.next_due_date && ` · próxima el ${d.next_due_date.slice(8)}/${d.next_due_date.slice(5, 7)}`}
                      </p>
                    </div>
                    <p className="tabular text-xl font-semibold">{formatMoney(balance, d.currency)}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Pagado de ${d.name}`} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p className="text-muted-foreground">
                      {planned ? <>Plan: queda pagada en <span className="text-foreground first-letter:uppercase">{monthLabel(planned)}</span></> : "Sin fecha en la proyección"}
                      {prepay && (
                        <>
                          {" "}· Prepagar hoy cuesta <span className="tabular text-foreground">{formatPEN(prepay.payoff)}</span> y te ahorra{" "}
                          <span className="tabular text-income">{formatPEN(prepay.interestSaved)}</span> de intereses
                        </>
                      )}
                    </p>
                    <DebtPaymentButton
                      accounts={catalogs.accounts}
                      debt={{ id: d.id, name: d.name, currency: d.currency, balance, suggested: prepay ? null : d.installment_amount ? Number(d.installment_amount) : balance }}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {card && (
        <Link href="/tarjeta" className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 text-sm hover:bg-muted/50">
          <CreditCard className="size-5 text-primary" />
          <span className="flex-1">
            Tarjeta: {formatPEN(card.used)} usados · pagas el total cada día {card.card.payment_day ?? 5}
            {card.plans.length > 0 && ` (incluye ${card.plans.length} compras en cuotas)`}
          </span>
        </Link>
      )}

      {paid.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PartyPopper className="size-4 text-primary" /> Pagadas
          </h2>
          <ul className="flex flex-wrap gap-2">
            {paid.map((d) => (
              <li key={d.id} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground line-through">
                {d.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
