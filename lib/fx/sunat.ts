// Tipo de cambio de SUNAT (SPEC 2: "API pública del BCRP o SUNAT"). Texto plano con el del día:
//   "02/11/2026|3.458|3.467|"  → fecha | compra | venta
// Se usa el de venta. Solo trae el día actual (el histórico se va guardando en fx_rates).
import type { FxQuote } from "./bcrp";

const URL = "https://www.sunat.gob.pe/a/txt/tipoCambio.txt";

export function parseSunatText(text: string): FxQuote | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\|([\d.]+)\|([\d.]+)\|/.exec(text.trim());
  if (!m) return null;
  const venta = Number(m[5]);
  return Number.isFinite(venta) && venta > 0 ? { date: `${m[3]}-${m[2]}-${m[1]}`, usdPen: venta, source: "sunat" } : null;
}

export async function fetchSunatToday(): Promise<FxQuote | null> {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    return parseSunatText(await res.text());
  } catch {
    return null;
  }
}
