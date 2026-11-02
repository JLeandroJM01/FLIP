// Fuente oficial del tipo de cambio: SUNAT (responde desde Vercel) y, si falla, BCRP.
// Un fallo se recuerda unos minutos para no esperar el timeout en cada movimiento (SPEC 3.2).
import { fetchBcrpRate, type FxQuote } from "./bcrp";
import { fetchSunatToday } from "./sunat";

let failedUntil = 0;

/** Cotización oficial más reciente hasta `date` (YYYY-MM-DD), o null. */
export async function fetchOfficialRate(date: string): Promise<FxQuote | null> {
  if (Date.now() < failedUntil) return null;
  const sunat = await fetchSunatToday();
  if (sunat && sunat.date <= date) return sunat;
  const bcrp = await fetchBcrpRate(date);
  if (bcrp) return bcrp;
  if (sunat) return sunat; // el de hoy, para fechas anteriores sin dato (se usa como el más cercano)
  failedUntil = Date.now() + 10 * 60 * 1000;
  return null;
}
