import { describe, expect, it } from "vitest";
import { parseBcrpResponse } from "@/lib/fx/bcrp";

describe("parseBcrpResponse", () => {
  it("lee las fechas en español e ignora los días sin dato", () => {
    const json = {
      config: { title: "Tipo de cambio" },
      periods: [
        { name: "29.Oct.26", values: ["3.452"] },
        { name: "30.Oct.26", values: ["n.d."] },
        { name: "02.Nov.26", values: ["3.448"] },
        { name: "15.Set.26", values: ["3.5"] },
      ],
    };
    expect(parseBcrpResponse(json)).toEqual([
      { date: "2026-09-15", usdPen: 3.5 },
      { date: "2026-10-29", usdPen: 3.452 },
      { date: "2026-11-02", usdPen: 3.448 },
    ]);
  });

  it("si no es la respuesta esperada, devuelve vacío", () => {
    expect(parseBcrpResponse("<html>Pardon Our Interruption</html>")).toEqual([]);
    expect(parseBcrpResponse(null)).toEqual([]);
  });
});
