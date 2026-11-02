// Impuesto de quinta estimado por mes (settings.monthly_tax_estimate, SPEC 9 y 9.5).
// Claves "YYYY-MM" (un mes puntual, p. ej. la retención de diciembre 2026) o "YYYY" (todo el año).
// Un año sin dato usa el último año conocido (no 0: eso inflaría el neto).
export function monthlyTaxFor(ym: string, table: Record<string, number>): number {
  if (ym in table) return table[ym];
  const year = Number(ym.slice(0, 4));
  const years = Object.keys(table)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => a - b);
  return years.length ? table[String(years.at(-1))] : 0;
}
