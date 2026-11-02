// Tipo de cambio del BCRP (SPEC 2). API pública de series estadísticas.
// Serie PD04640PD: TC sistema bancario SBS, venta (S/ por US$).
// ⚠️ Verificar la serie y el formato contra una respuesta real: desde la máquina de
// desarrollo el BCRP respondió con una página antibots. Si falla, se usa el ingreso manual.

const SERIES = "PD04640PD";
const BASE = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api";

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
};

export type FxQuote = { date: string; usdPen: number };

type BcrpResponse = { periods?: { name: string; values: string[] }[] };

/** Convierte la respuesta del BCRP en cotizaciones; ignora días sin dato ("n.d."). */
export function parseBcrpResponse(json: unknown): FxQuote[] {
  const periods = (json as BcrpResponse)?.periods;
  if (!Array.isArray(periods)) return [];
  const quotes: FxQuote[] = [];
  for (const p of periods) {
    const m = /^(\d{1,2})\.([A-Za-z]{3})\.(\d{2})$/.exec(p.name?.trim() ?? "");
    const month = m && MONTHS[m[2].toLowerCase()];
    const value = Number(p.values?.[0]);
    if (!m || !month || !Number.isFinite(value) || value <= 0) continue;
    const date = `20${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    quotes.push({ date, usdPen: value });
  }
  return quotes.sort((a, b) => a.date.localeCompare(b.date));
}

/** Última cotización disponible hasta `date` (YYYY-MM-DD), mirando 10 días atrás. */
export async function fetchBcrpRate(date: string): Promise<FxQuote | null> {
  const to = date;
  const fromDate = new Date(`${date}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 10);
  const from = fromDate.toISOString().slice(0, 10);
  try {
    const res = await fetch(`${BASE}/${SERIES}/json/${from}/${to}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const quotes = parseBcrpResponse(await res.json());
    return quotes.filter((q) => q.date <= date).at(-1) ?? null;
  } catch {
    return null; // sin red, página antibots (HTML) o timeout → ingreso manual
  }
}
