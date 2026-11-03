"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatPEN } from "@/lib/format";
import type { Category } from "@/lib/types";

// Mismo color validado que en Metas (dataviz: banda de luminosidad y contraste sobre #171717).
const SERIES = "#1fa874";
const MUTED = "#9a9a9a";
const GRID = "#2a2a2a";

export type CategoryMonth = { ym: string; total: number; byCategory: Record<string, number> };

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const shortMonth = (ym: string) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
const longMonth = (ym: string) => formatMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
const compact = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });

/** Gasto por mes de la categoría elegida (o el total), últimos 6 meses. */
export function CategoryChart({ months, categories }: { months: CategoryMonth[]; categories: Category[] }) {
  // Solo las categorías con gasto en el período, ordenadas por lo gastado.
  const ranked = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of months) for (const [id, v] of Object.entries(m.byCategory)) totals.set(id, (totals.get(id) ?? 0) + Math.max(0, v));
    return categories
      .filter((c) => c.kind === "gasto" && (totals.get(c.id) ?? 0) > 0)
      .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  }, [months, categories]);
  const [selected, setSelected] = useState<string>("total");

  const data = months.map((m) => ({
    ym: m.ym,
    value: Math.max(0, selected === "total" ? m.total : (m.byCategory[selected] ?? 0)),
  }));
  const current = data.at(-1)!;
  const previous = data.slice(0, -1);
  const average = previous.length ? previous.reduce((s, d) => s + d.value, 0) / previous.length : 0;
  const category = ranked.find((c) => c.id === selected);
  const name = category?.name ?? "Todo";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {category && <CategoryIcon icon={category.icon} color={category.color} size="sm" />}
            Gasto en {name.toLowerCase() === "todo" ? "total" : name} por mes
          </CardTitle>
          <CardDescription>
            Este mes {formatPEN(current.value)} · promedio de los 5 anteriores {formatPEN(average)}
            {average > 0 && (
              <> ({current.value >= average ? "+" : "−"}{Math.abs(Math.round(((current.value - average) / average) * 100))}%)</>
            )}
          </CardDescription>
        </div>
        <label className="space-y-1.5 text-sm">
          <span className="block text-muted-foreground">Categoría</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-11 w-full min-w-48 rounded-lg border bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <option value="total">Todo el gasto</option>
            {ranked.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full md:h-64" role="img" aria-label={`Gasto en ${name} en los últimos ${data.length} meses`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
              <XAxis dataKey="ym" tickFormatter={shortMonth} tick={{ fill: MUTED, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip />} />
              <Bar dataKey="value" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Ver como tabla</summary>
          <table className="mt-1 w-full text-left">
            <tbody className="tabular divide-y">
              {data.map((d) => (
                <tr key={d.ym}>
                  <td className="py-2 first-letter:uppercase">{longMonth(d.ym)}</td>
                  <td className="py-2 text-right">{formatPEN(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { ym: string; value: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground first-letter:uppercase">{longMonth(p.ym)}</p>
      <p className="tabular text-sm font-semibold">{formatPEN(p.value)}</p>
    </div>
  );
}
