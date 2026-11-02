// Fechas de los correos (SPEC 5), en hora de Lima. Formatos vistos:
//   "31 de octubre de 2026 - 08:17 PM"     "22 de Octubre de 2026 - 11:50 AM"
//   "27 de octubre de 2026 - 19:40 PM"     (24 horas con "PM": si la hora > 12, se ignora AM/PM)
//   "31 de octubre de 2026 - 11:39 p. m."  "Lunes, 26 Octubre 2026 - 08:22 A. M."
//   "30 Oct, 2026 - 07:37 am"              "02 Nov, 2026 - 01:58 pm"
//   "01 nov. 2026 - 08:15 p. m."           "1 nov. 2026, 9:55 p. m."
//   "02/11/2026 09:44"                     "01/11/2026 a las 20:15"

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, apr: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, aug: 8,
  set: 9, sep: 9, sept: 9, setiembre: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12, dec: 12,
};

const TIME = String.raw`(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?`;
const BY_NAME = new RegExp(
  String.raw`(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\s*(?:-|,|a las)?\s*` + TIME,
  "i",
);
const BY_NUMBER = new RegExp(String.raw`(\d{1,2})/(\d{1,2})/(\d{4})\s*(?:a las\s*|-\s*)?` + TIME, "i");

/** Devuelve el instante (UTC) o null si no reconoce la fecha. */
export function parseEmailDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  let day: number, month: number, year: number, hour: number, minute: number, ampm: string | undefined;
  const byName = BY_NAME.exec(raw);
  const byNumber = byName ? null : BY_NUMBER.exec(raw);
  if (byName) {
    month = MONTHS[byName[2].toLowerCase()];
    if (!month) return null;
    [day, year, hour, minute] = [byName[1], byName[3], byName[4], byName[5]].map(Number);
    ampm = byName[6];
  } else if (byNumber) {
    [day, month, year, hour, minute] = byNumber.slice(1, 6).map(Number);
    ampm = byNumber[6];
  } else {
    return null;
  }

  if (hour <= 12 && ampm) {
    const pm = /^p/i.test(ampm);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-05:00`);
}
