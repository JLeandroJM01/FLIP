"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildProjectionInput, downPaymentAvailable, mortgagePayment, project, type ProjectionContext } from "@/lib/finance";
import { formatMonth, formatPEN } from "@/lib/format";

// Color de la serie validado con dataviz/validate_palette (banda de luminosidad y contraste sobre #171717).
const SERIES = "#1fa874";
const MUTED = "#9a9a9a";
const GRID = "#2a2a2a";

export type DepaParams = { price: number; down_pct: number; closing_pct: number; bono_buen_pagador: number; tea: number; years: number };

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return formatMonth(y, m);
};
const compact = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 0 });

export function GoalsView({ ctx, depa, defaultLiving }: { ctx: ProjectionContext; depa: DepaParams; defaultLiving: number }) {
  const [living, setLiving] = useState(defaultLiving);
  const target = depa.price * (depa.down_pct + depa.closing_pct);

  const scenario = (l: number, bonus: number) => project(buildProjectionInput(ctx, { living: l, bonusSalaries: bonus }));
  const { base, withBonus, data } = useMemo(() => {
    const base = scenario(living, 0);
    const withBonus = scenario(living, ctx.bonusMaxSalaries);
    const data = base.months.map((m, i) => {
      const low = downPaymentAvailable(m);
      const high = downPaymentAvailable(withBonus.months[i]);
      return { ym: m.ym, low, high, band: [low, high] as [number, number], savings: m.savings, cts: m.cts, afp: m.afp, debts: m.debtsLeft };
    });
    return { base, withBonus, data };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [living, ctx]);

  const reach = (r: typeof base) => r.months.find((m) => downPaymentAvailable(m) >= target)?.ym ?? null;
  const loan = depa.price * (1 - depa.down_pct) - depa.bono_buen_pagador;
  const payment = mortgagePayment(loan, depa.tea, depa.years);
  const year2028 = base.months.filter((m) => m.ym.startsWith("2028"));
  const avgIncome2028 = year2028.length ? year2028.reduce((s, m) => s + m.income, 0) / year2028.length : 0;
  const regular2028 = ctx.salary.monthlyGross * (1 - ctx.salary.afpRates.aporte - ctx.salary.afpRates.seguro - ctx.salary.afpRates.comision) - (ctx.taxTable["2028"] ?? 0);
  const today = data[0]; // cierre del mes actual (ya con los pagos de deudas del mes)
  const ticks = data.filter((d) => d.ym.endsWith("-01")).map((d) => d.ym);

  const scenarios = [1500, 2000, 2500].map((l) => {
    const r0 = scenario(l, 0);
    const r2 = scenario(l, ctx.bonusMaxSalaries);
    return { living: l, debtFree: r0.debtFreeMonth, savings: r0.months.at(-1)!.savings, savingsBonus: r2.months.at(-1)!.savings, goal: reach(r0), goalBonus: reach(r2) };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Inicial disponible a fin de mes" value={formatPEN(downPaymentAvailable(today))} hint={`Meta: ${formatPEN(target)} (${Math.round(depa.down_pct * 100)}% + ${Math.round(depa.closing_pct * 100)}% de gastos)`} />
        <Stat
          label="Llegas a la meta en"
          value={reach(base) ? monthName(reach(base)!) : "después de nov 2029"}
          hint={reach(withBonus) ? `Con bono de ${ctx.bonusMaxSalaries} sueldos: ${monthName(reach(withBonus)!)}` : undefined}
          capitalize
        />
        <Stat label="Sin deudas desde" value={base.debtFreeMonth ? monthName(base.debtFreeMonth) : "—"} capitalize />
        <Stat
          label="Cuota hipotecaria estimada"
          value={formatPEN(payment)}
          hint={`${Math.round((payment / regular2028) * 100)}% de tu neto regular 2028 (${formatPEN(regular2028)}); ${Math.round((payment / avgIncome2028) * 100)}% del promedio con gratificaciones y utilidades (${formatPEN(avgIncome2028)})`}
        />
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Inicial disponible para el depa</CardTitle>
            <CardDescription>Ahorro + 50% de la CTS + 25% del fondo AFP. La banda va de sin bono a un bono de {ctx.bonusMaxSalaries} sueldos.</CardDescription>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="living">¿Y si gasto al mes…?</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={500}
                max={4000}
                step={50}
                value={living}
                onChange={(e) => setLiving(Number(e.target.value))}
                className="w-40 accent-[var(--primary)]"
                aria-label="Gasto de vida mensual"
              />
              <Input
                id="living"
                inputMode="numeric"
                value={living}
                onChange={(e) => setLiving(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
                className="tabular h-11 w-24"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full md:h-80" role="img" aria-label={`Inicial disponible proyectada hasta noviembre 2029 con un gasto de ${formatPEN(living)} al mes`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="ym" ticks={ticks} tickFormatter={(ym: string) => ym.slice(0, 4)} tick={{ fill: MUTED, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip cursor={{ stroke: MUTED, strokeWidth: 1 }} content={<ChartTooltip />} />
                <ReferenceLine y={target} stroke={MUTED} strokeWidth={1} label={{ value: `Meta ${compact.format(target)}`, fill: MUTED, fontSize: 12, position: "insideTopLeft" }} />
                <Area dataKey="band" stroke="none" fill={SERIES} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />
                <Line dataKey="low" stroke={SERIES} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4, stroke: "#171717", strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-4 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Ver como tabla</summary>
            <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[22rem] text-left">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Mes</th>
                  <th className="py-2 text-right font-medium">Ahorro</th>
                  <th className="py-2 text-right font-medium">Inicial</th>
                  <th className="py-2 text-right font-medium">Con bono</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y">
                {data.filter((d) => d.ym.endsWith("-12") || d.ym === data.at(-1)!.ym).map((d) => (
                  <tr key={d.ym}>
                    <td className="py-2 first-letter:uppercase">{monthName(d.ym)}</td>
                    <td className="py-2 text-right">{formatPEN(d.savings)}</td>
                    <td className="py-2 text-right">{formatPEN(d.low)}</td>
                    <td className="py-2 text-right">{formatPEN(d.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escenarios (SPEC 14)</CardTitle>
          <CardDescription>Sin aumentos de sueldo, utilidades de 4.5 sueldos, US$ a S/ {(3.45).toFixed(2)}. El ahorro no incluye CTS ni AFP.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Gasto al mes</th>
                <th className="py-2 font-medium">Sin deudas desde</th>
                <th className="py-2 text-right font-medium">Ahorro a nov 2029</th>
                <th className="py-2 text-right font-medium">Con bono</th>
                <th className="py-2 font-medium pl-4">Meta del depa</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y">
              {scenarios.map((s) => (
                <tr key={s.living}>
                  <td className="py-2.5">{formatPEN(s.living)}</td>
                  <td className="py-2.5 first-letter:uppercase">{s.debtFree ? monthName(s.debtFree) : "—"}</td>
                  <td className="py-2.5 text-right">{formatPEN(s.savings)}</td>
                  <td className="py-2.5 text-right">{formatPEN(s.savingsBonus)}</td>
                  <td className="py-2.5 pl-4">
                    {s.goal ? monthName(s.goal) : "después de nov 2029"}
                    {s.goalBonus && s.goalBonus !== s.goal && <span className="text-muted-foreground"> ({monthName(s.goalBonus)} con bono)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, capitalize }: { label: string; value: string; hint?: string; capitalize?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={capitalize ? "text-2xl first-letter:uppercase" : "tabular text-2xl"}>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

type TooltipPayload = { payload: { ym: string; low: number; high: number; savings: number; cts: number; afp: number; debts: number } };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="min-w-48 space-y-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium first-letter:uppercase">{monthName(p.ym)}</p>
      <Row label="Inicial disponible" value={p.low} strong />
      <Row label="Con bono" value={p.high} />
      <Row label="Ahorro" value={p.savings} />
      <Row label="CTS (50%)" value={p.cts * 0.5} />
      <Row label="AFP (25%)" value={p.afp * 0.25} />
      {p.debts > 0 && <Row label="Deudas pendientes" value={p.debts} />}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "tabular font-semibold" : "tabular"}>{formatPEN(value)}</span>
    </p>
  );
}
