// Fechas de negocio en hora de Lima. El "día" y el "mes" se calculan en
// America/Lima, no en UTC. Perú no tiene horario de verano (UTC−5 fijo).

import { LIMA_TZ } from "./format";

const LIMA_OFFSET = "-05:00";

export type YearMonth = { year: number; month: number }; // month: 1–12

/** Año, mes y día de un instante, vistos en Lima. */
export function limaParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** `YYYY-MM-DD` del día en Lima. */
export function limaDateKey(date: Date): string {
  const { year, month, day } = limaParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function currentYearMonth(now: Date = new Date()): YearMonth {
  const { year, month } = limaParts(now);
  return { year, month };
}

/** Inicio (incluido) y fin (excluido) del mes en Lima, como instantes. */
export function monthRange({ year, month }: YearMonth): { start: Date; end: Date } {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: new Date(`${year}-${pad(month)}-01T00:00:00${LIMA_OFFSET}`),
    end: new Date(`${next.year}-${pad(next.month)}-01T00:00:00${LIMA_OFFSET}`),
  };
}

/** Parsea `YYYY-MM` (por ejemplo, de un filtro en la URL). */
export function parseYearMonth(value: string | undefined | null): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month };
}

export function yearMonthKey({ year, month }: YearMonth): string {
  return `${year}-${pad(month)}`;
}

/** Valor para un `<input type="datetime-local">` en hora de Lima. */
export function toLimaDateTimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Interpreta un `datetime-local` como hora de Lima. */
export function fromLimaDateTimeLocal(value: string): Date {
  return new Date(`${value}:00${LIMA_OFFSET}`);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
