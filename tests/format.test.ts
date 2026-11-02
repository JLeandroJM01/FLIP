import { describe, expect, it } from "vitest";
import { formatMonth, formatPEN, formatShortDate, formatUSD } from "@/lib/format";

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
  it("nombra el mes en español", () => {
    expect(formatMonth(2026, 11)).toBe("noviembre de 2026");
  });
});
