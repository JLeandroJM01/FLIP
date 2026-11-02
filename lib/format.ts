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

/** `2 nov.` */
export function formatShortDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TZ,
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

/** `lunes, 2 de noviembre` */
export function formatDayHeading(date: Date | string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date));
}

/** `12:30 a. m.` */
export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

/** `noviembre de 2026` */
export function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}
