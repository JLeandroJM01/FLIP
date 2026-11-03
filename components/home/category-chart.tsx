"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatPEN } from "@/lib/format";
import type { Category } from "@/lib/types";

// Color validado con dataviz (banda de luminosidad y contraste sobre #171717). Una sola serie:
// la identidad de cada barra la da su etiqueta, no el color.
const SERIES = "#1fa874";
const SERIES_DIM = "#1fa87455"; // barras no elegidas cuando hay una categoría seleccionada
const MUTED = "#9a9a9a";
const GRID = "#2a2a2a";
const MAX_BARS = 8; // el resto se agrupa en "Otras"

export type CategoryMonth = { ym: string; total: number; byCategory: Record<string, number> };

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const shortMonth = (ym: string) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
const longMonth = (ym: string) => formatMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
const compact = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });
const SELECT =
  "h-11 w-full min-w-44 rounded-lg border bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto";

/** Gasto por categoría (barras, un mes) + gasto por mes de la categoría elegida (histograma, 6 meses). */
export function CategoryChart({ months, categories }: { months: CategoryMonth[]; categories: Category[] }) {
  const [monthKey, setMonthKey] = useState(months.at(-1)!.ym);
  const [selected, setSelected] = useState<string>("total");
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Categorías con gasto en algún mes, ordenadas por lo gastado en los 6 meses (para el selector).
  const ranked = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of months) for (const [id, v] of Object.entries(m.byCategory)) totals.set(id, (totals.get(id) ?? 0) + Math.max(0, v));
    return categories
      .filter((c) => c.kind === "gasto" && (totals.get(c.id) ?? 0) > 0)
      .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  }, [months, categories]);

  // Barras del mes elegido.
  const month = months.find((m) => m.ym === monthKey) ?? months.at(-1)!;
  const bars = useMemo(() => {
    const rows = Object.entries(month.byCategory)
      .filter(([, v]) => v > 0.005)
      .map(([id, value]) => ({ id, name: byId.get(id)?.name ?? "Sin categoría", value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
    if (rows.length <= MAX_BARS) return rows;
    const others = rows.slice(MAX_BARS - 1).reduce((s, r) => s + r.value, 0);
    return [...rows.slice(0, MAX_BARS - 1), { id: "otras", name: "Otras", value: Math.round(others * 100) / 100 }];
  }, [month, byId]);
  const monthTotal = bars.reduce((s, b) => s + b.value, 0);

  // Histograma de la categoría elegida.
  const series = months.map((m) => ({ ym: m.ym, value: Math.max(0, selected === "total" ? m.total : (m.byCategory[selected] ?? 0)) }));
  const current = series.at(-1)!;
  const previous = series.slice(0, -1);
  const average = previous.length ? previous.reduce((s, d) => s + d.value, 0) / previous.length : 0;
  const category = byId.get(selected);
  const title = category ? category.name : "total";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Gasto por categoría</CardTitle>
            <CardDescription>
              {formatPEN(monthTotal)} en {longMonth(month.ym)}. Toca una barra para ver su evolución.
            </CardDescription>
          </div>
          <label className="space-y-1.5 text-sm">
            <span className="block text-muted-foreground">Mes</span>
            <select value={month.ym} onChange={(e) => setMonthKey(e.target.value)} className={SELECT}>
              {[...months].reverse().map((m) => (
                <option key={m.ym} value={m.ym}>
                  {longMonth(m.ym)}
                </option>
              ))}
            </select>
          </label>
        </CardHeader>
        <CardContent>
          {bars.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay gastos en {longMonth(month.ym)}.</p>
          ) : (
            <div style={{ height: bars.length * 40 + 8 }} className="w-full" role="img" aria-label={`Gasto por categoría en ${longMonth(month.ym)}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap="30%">
                  <XAxis type="number" hide domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fill: "#ededed", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<BarTooltip total={monthTotal} />} />
                  <Bar
                    dataKey="value"
                    maxBarSize={24}
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                    onClick={(d: { id?: string; payload?: { id?: string } }) => {
                      const id = d.payload?.id ?? d.id;
                      if (id && id !== "otras") setSelected(id === selected ? "total" : id);
                    }}
                    className="cursor-pointer"
                  >
                    {bars.map((b) => (
                      <Cell key={b.id} fill={selected === "total" || selected === b.id ? SERIES : SERIES_DIM} />
                    ))}
                    {/* Barras → valor en la punta (en tinta de texto, no en el color de la serie). */}
                    <LabelList dataKey="value" position="right" formatter={(v) => formatPEN(Number(v))} fill="#ededed" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <details className="mt-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Ver como tabla</summary>
            <table className="mt-1 w-full text-left">
              <tbody className="tabular divide-y">
                {bars.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2">{b.name}</td>
                    <td className="py-2 text-right">{formatPEN(b.value)}</td>
                    <td className="w-14 py-2 text-right text-muted-foreground">{monthTotal > 0 ? Math.round((b.value / monthTotal) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {category && <CategoryIcon icon={category.icon} color={category.color} size="sm" />}
              Gasto en {title} por mes
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
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className={SELECT}>
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
          <div className="h-56 w-full md:h-64" role="img" aria-label={`Gasto en ${title} en los últimos ${series.length} meses`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="ym" tickFormatter={shortMonth} tick={{ fill: MUTED, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<MonthTooltip />} />
                <Bar dataKey="value" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Ver como tabla</summary>
            <table className="mt-1 w-full text-left">
              <tbody className="tabular divide-y">
                {series.map((d) => (
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
    </div>
  );
}

function BarTooltip({ active, payload, total }: { active?: boolean; payload?: { payload: { name: string; value: number } }[]; total: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="tabular text-sm font-semibold">{formatPEN(p.value)}</p>
      <p className="text-muted-foreground">
        {p.name} · {total > 0 ? Math.round((p.value / total) * 100) : 0}% del mes
      </p>
    </div>
  );
}

function MonthTooltip({ active, payload }: { active?: boolean; payload?: { payload: { ym: string; value: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="tabular text-sm font-semibold">{formatPEN(p.value)}</p>
      <p className="text-muted-foreground first-letter:uppercase">{longMonth(p.ym)}</p>
    </div>
  );
}
