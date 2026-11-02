import { describe, expect, it } from "vitest";
import {
  currentYearMonth,
  fromLimaDateTimeLocal,
  limaDateKey,
  monthRange,
  parseYearMonth,
  toLimaDateTimeLocal,
} from "@/lib/dates";

describe("hora de Lima", () => {
  it("un gasto a las 11 p. m. del 31 oct en Lima es de octubre", () => {
    const d = new Date("2026-11-01T04:00:00Z"); // 23:00 del 31 oct en Lima
    expect(limaDateKey(d)).toBe("2026-10-31");
    expect(currentYearMonth(d)).toEqual({ year: 2026, month: 10 });
  });

  it("el mes empieza a medianoche de Lima (05:00 UTC)", () => {
    const { start, end } = monthRange({ year: 2026, month: 11 });
    expect(start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });

  it("diciembre pasa al año siguiente", () => {
    expect(monthRange({ year: 2026, month: 12 }).end.toISOString()).toBe(
      "2027-01-01T05:00:00.000Z",
    );
  });

  it("datetime-local ida y vuelta en hora de Lima", () => {
    const d = new Date("2026-11-02T17:31:00Z");
    expect(toLimaDateTimeLocal(d)).toBe("2026-11-02T12:31");
    expect(fromLimaDateTimeLocal("2026-11-02T12:31").toISOString()).toBe(
      "2026-11-02T17:31:00.000Z",
    );
  });

  it("parseYearMonth valida el formato", () => {
    expect(parseYearMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth(undefined)).toBeNull();
  });
});
