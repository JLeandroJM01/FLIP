import { describe, expect, it } from "vitest";
import { formatDayHeading, formatMonth, formatPEN, formatShortDate, formatTime, formatUSD } from "@/lib/format";

const nbsp = " ";

describe("formatPEN", () => {
  it("usa S/ con coma de miles y punto decimal (es-PE)", () => {
    expect(formatPEN(1234.56)).toBe(`S/${nbsp}1,234.56`);
    expect(formatPEN(0)).toBe(`S/${nbsp}0.00`);
    expect(formatPEN(6568.52)).toBe(`S/${nbsp}6,568.52`);
  });
});

describe("formatUSD", () => {
  it("usa US$ como en el SPEC", () => {
    expect(formatUSD(3.84)).toBe(`US$${nbsp}3.84`);
    expect(formatUSD(1489)).toBe(`US$${nbsp}1,489.00`);
    expect(formatUSD(-400)).toBe(`-US$${nbsp}400.00`);
  });
});

describe("fechas", () => {
  it("muestra el día en hora de Lima, no en UTC", () => {
    // 02:00 UTC del 2 nov = 21:00 del 1 nov en Lima
    expect(formatShortDate("2026-11-02T02:00:00Z")).toBe("1 nov.");
  });
  it("hora en 12 horas como en es-PE, sin espacios duros", () => {
    expect(formatTime("2026-11-02T05:30:00Z")).toBe("12:30 a. m.");
    expect(formatTime("2026-11-02T19:31:00Z")).toBe("2:31 p. m.");
    expect(formatTime("2026-11-02T17:05:00Z")).toBe("12:05 p. m.");
  });
  it("encabezado del día en hora de Lima", () => {
    expect(formatDayHeading("2026-11-02T04:00:00Z")).toBe("domingo, 1 de noviembre");
  });
  it("nombra el mes en español", () => {
    expect(formatMonth(2026, 11)).toBe("noviembre de 2026");
  });
});
