import { describe, expect, it } from "vitest";
import { parseEmailDate } from "@/lib/parsers/dates";
import { parseMoney, parsePercent, parseRate } from "@/lib/parsers/money";
import { field, last4After, normalizeBody } from "@/lib/parsers/text";

const lima = (iso: string) => new Date(`${iso}:00-05:00`).toISOString();

describe("parseEmailDate (todos los formatos del SPEC y de los correos reales)", () => {
  it.each([
    ["01 de noviembre de 2026 - 02:31 PM", "2026-11-01T14:31"],
    ["22 de Octubre de 2026 - 11:50 AM", "2026-10-22T11:50"],
    ["Lunes, 26 Octubre 2026 - 08:22 A. M.", "2026-10-26T08:22"],
    ["30 Oct, 2026 - 07:37 am", "2026-10-30T07:37"],
    ["27 de octubre de 2026 - 19:40 PM", "2026-10-27T19:40"],
    ["31 de octubre de 2026 - 11:39 p. m.", "2026-10-31T23:39"],
    ["01 nov. 2026 - 08:15 p. m.", "2026-11-01T20:15"],
    ["1 nov. 2026, 9:55 p. m.", "2026-11-01T21:55"],
    ["02 Nov, 2026 - 01:58 pm", "2026-11-02T13:58"],
    ["02/11/2026 09:44", "2026-11-02T09:44"],
    ["01/11/2026 a las 20:15", "2026-11-01T20:15"],
    ["15 de setiembre de 2026 - 12:05 AM", "2026-09-15T00:05"],
    ["05 de diciembre de 2026 - 12:30 PM", "2026-12-05T12:30"],
  ])("%s", (raw, expected) => expect(parseEmailDate(raw)?.toISOString()).toBe(lima(expected)));

  it("devuelve null si no entiende la fecha", () => {
    expect(parseEmailDate("mañana temprano")).toBeNull();
    expect(parseEmailDate(null)).toBeNull();
  });
});

describe("parseMoney", () => {
  it.each([
    ["S/ 1,234.56", 1234.56, "PEN"],
    ["S/1,060.00", 1060, "PEN"],
    ["S/50", 50, "PEN"],
    ["S/ 17.9", 17.9, "PEN"],
    ["$ 3.84", 3.84, "USD"],
    ["$299.50", 299.5, "USD"],
    ["GRATIS", 0, "PEN"],
  ])("%s", (raw, amount, currency) => expect(parseMoney(raw)).toEqual({ amount, currency }));

  it("tipo de cambio y porcentaje", () => {
    expect(parseRate("S/ 3.4990")).toBe(3.499);
    expect(parsePercent("91.89%")).toBeCloseTo(0.9189, 6);
  });
});

describe("campos del texto plano", () => {
  const body = normalizeBody(
    "Empresa *Norky&apos;s* \nDesde *Cuenta sueldo*\n**** 2046 \nCelular: *** *** 840\nMonto: S/50\n(01)​ 311​-9898 <#>",
  );
  it("lee valores entre asteriscos o hasta el fin de línea, y limpia entidades", () => {
    expect(field(body, "Empresa")).toBe("Norky's");
    expect(field("Empresa *MP*ARUMA* \nNúmero", "Empresa")).toBe("MP*ARUMA");
    expect(field(body, "Monto")).toBe("S/50");
    expect(body).toContain("(01) 311-9898");
    expect(body).not.toContain("<#>");
  });
  it("lee los últimos dígitos en la línea siguiente", () => {
    expect(last4After(body, "Desde")).toBe("2046");
  });
});
