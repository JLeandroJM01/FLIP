// Formato de montos y fechas para la interfaz (es-PE, hora de Lima).

export const LIMA_TZ = "America/Lima";

export type Currency = "PEN" | "USD";

const numberFormat = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const penFormat = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

/** `S/ 1,234.56` (con espacio duro, como lo da Intl es-PE). */
export function formatPEN(amount: number): string {
  return penFormat.format(amount);
}

/** `US$ 3.84`: Intl da "USD 3.84", el SPEC usa "US$". */
export function formatUSD(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}US$ ${numberFormat.format(Math.abs(amount))}`;
}

export function formatMoney(amount: number, currency: Currency): string {
  return currency === "USD" ? formatUSD(amount) : formatPEN(amount);
}

// Fechas y horas armadas a mano: Intl varía entre Node y el navegador (espacios duros,
// "a. m." vs "a.m."), y esa diferencia rompe la hidratación de React.
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Partes de un instante en hora de Lima (UTC−5 fijo, sin horario de verano). */
function limaClock(date: Date | string) {
  const d = new Date(new Date(date).getTime() - 5 * 3_600_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** `2 nov.` */
export function formatShortDate(date: Date | string): string {
  const c = limaClock(date);
  return `${c.day} ${MONTHS_SHORT[c.month]}`;
}

/** `lunes, 2 de noviembre` */
export function formatDayHeading(date: Date | string): string {
  const c = limaClock(date);
  return `${WEEKDAYS[c.weekday]}, ${c.day} de ${MONTHS[c.month]}`;
}

/** `12:30 a. m.` */
export function formatTime(date: Date | string): string {
  const c = limaClock(date);
  const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
  return `${h12}:${String(c.minute).padStart(2, "0")} ${c.hour < 12 ? "a. m." : "p. m."}`;
}

/** `noviembre de 2026` */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month - 1]} de ${year}`;
}
