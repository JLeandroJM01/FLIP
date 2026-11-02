import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getCatalogs } from "@/lib/data";
import { limaDateKey } from "@/lib/dates";
import { afpDiscount, afpTotalRate, incomeEventsInMonth, monthlyNet, monthlyTaxFor, monthsBetween, salaryPaymentsOn } from "@/lib/finance";
import { formatMonth, formatPEN, formatShortDate } from "@/lib/format";
import { loadProjectionContext } from "@/lib/projection-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ingresos · FLIP" };

const PART: Record<string, string> = { adelanto: "Adelanto", resto: "Resto del mes", parcial: "Días trabajados", unico: "Sueldo" };
type Row = { date: string; label: string; amount: number; kind: string; dayUnknown?: boolean; illiquid?: boolean };

export default async function IncomePage() {
  const { supabase } = await requireUser();
  const today = limaDateKey(new Date());
  const catalogs = await getCatalogs(supabase);
  const [ctx, { data: events }] = await Promise.all([
    loadProjectionContext(supabase, catalogs, today),
    supabase.from("income_events").select("kind, expected_date, expected_amount, note, tx:transactions(amount_pen, status)").order("expected_date", { ascending: false }).limit(24),
  ]);
  if (!ctx) return <p className="p-6 text-muted-foreground">Falta el perfil de ingresos.</p>;

  const tax = (ym: string) => monthlyTaxFor(ym, ctx.taxTable);
  const gross = ctx.salary.monthlyGross;
  const year = Number(today.slice(0, 4));
  const registered = new Map((events ?? []).map((e) => [`${e.kind}|${e.expected_date}`, e]));

  // Calendario: próximos 12 meses (sueldo, gratificaciones, CTS, utilidades…).
  const rows: Row[] = [];
  const months = monthsBetween(today.slice(0, 7), monthsBetween(today.slice(0, 7), "2100-12")[11]);
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
      const date = `${ym}-${String(d).padStart(2, "0")}`;
      if (date < today) continue;
      for (const p of salaryPaymentsOn(date, ctx.salary, tax)) {
        const [cy, cm] = p.covers.split("-").map(Number);
        rows.push({ date, kind: "sueldo", amount: p.amount, label: `${PART[p.part]} · ${formatMonth(cy, cm)}` });
      }
    }
    for (const e of incomeEventsInMonth(y, m, ctx.income, ctx.calendar, ctx.estimates)) {
      if (e.date < today && !e.dayUnknown) continue;
      rows.push({ date: e.date, kind: e.kind, amount: e.amount, label: e.label, dayUnknown: e.dayUnknown, illiquid: e.illiquid });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const realVsExpected = (events ?? []).filter((e) => {
    const tx = e.tx as { amount_pen: number; status: string } | null;
    return tx && e.expected_date <= today;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Luz del Sur · desde el {formatShortDate(`${ctx.salary.startDate}T12:00:00-05:00`)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ingresos</h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Sueldo bruto</CardDescription>
            <CardTitle className="tabular text-2xl">{formatPEN(gross)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AFP {(afpTotalRate(ctx.salary.afpRates) * 100).toFixed(2)}% = {formatPEN(afpDiscount(gross, ctx.salary.afpRates))}
          </CardContent>
        </Card>
        {[year, year + 1].map((y) => (
          <Card key={y}>
            <CardHeader>
              <CardDescription>Neto de un mes normal {y}</CardDescription>
              <CardTitle className="tabular text-2xl">{formatPEN(monthlyNet({ monthlyGross: gross, afpRates: ctx.salary.afpRates, annualTax: tax(`${y}-06`) * 12 }))}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Impuesto estimado {formatPEN(tax(`${y}-06`))}/mes</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Días de pago</CardDescription>
            <CardTitle className="text-2xl">
              {ctx.salary.paySchedule.map((p) => p.day).join(" y ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Gratificación el {ctx.calendar.gratificacion_day} · CTS el {ctx.calendar.cts_day} · utilidades el {ctx.calendar.utilidades_day}/
            {String(ctx.calendar.utilidades_month).padStart(2, "0")}. Cámbialo en Ajustes.
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-medium">
          <CalendarDays className="size-4 text-primary" /> Próximos 12 meses
        </h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((r) => {
            const done = registered.get(`${r.kind}|${r.date}`);
            return (
              <li key={`${r.kind}-${r.date}-${r.label}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-20 shrink-0 text-muted-foreground">
                  {r.dayUnknown ? formatMonth(Number(r.date.slice(0, 4)), Number(r.date.slice(5, 7))).replace(/ de \d+$/, "") : formatShortDate(`${r.date}T12:00:00-05:00`)}
                </span>
                <span className="min-w-0 flex-1">
                  {r.label}
                  {r.illiquid && <span className="text-xs text-muted-foreground"> · a la cuenta CTS</span>}
                  {r.dayUnknown && <span className="text-xs text-muted-foreground"> · día por confirmar (regístralo a mano)</span>}
                </span>
                <span className={cn("tabular font-medium", r.illiquid ? "text-muted-foreground" : "text-income")}>{formatPEN(r.amount)}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">{done ? "registrado" : "estimado"}</span>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-xs text-muted-foreground">
          FLIP registra solo el sueldo, la gratificación, la CTS y las utilidades en su fecha. Si el monto real es otro, corrígelo en Movimientos.
        </p>
      </section>

      {realVsExpected.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Real vs estimado</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {realVsExpected.map((e) => {
              const tx = e.tx as unknown as { amount_pen: number };
              const diff = Number(tx.amount_pen) - Number(e.expected_amount);
              return (
                <li key={`${e.kind}-${e.expected_date}`} className="flex flex-wrap items-center gap-x-4 px-4 py-3 text-sm">
                  <span className="w-20 text-muted-foreground">{formatShortDate(`${e.expected_date}T12:00:00-05:00`)}</span>
                  <span className="flex-1">{e.note && PART[e.note] ? PART[e.note] : (e.note ?? e.kind)}</span>
                  <span className="tabular text-muted-foreground">est. {formatPEN(Number(e.expected_amount))}</span>
                  <span className="tabular font-medium">{formatPEN(Number(tx.amount_pen))}</span>
                  <span className={cn("tabular w-20 text-right text-xs", Math.abs(diff) < 0.005 ? "text-muted-foreground" : diff > 0 ? "text-income" : "text-destructive")}>
                    {Math.abs(diff) < 0.005 ? "igual" : `${diff > 0 ? "+" : "−"}${formatPEN(Math.abs(diff))}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
