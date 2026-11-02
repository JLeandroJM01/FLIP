import { describe, expect, it } from "vitest";
import { parseAmount, transactionSchema } from "@/lib/transaction-input";

const ACC = "3f1c1d1e-1111-4a2b-8c3d-000000000001";
const CAT = "3f1c1d1e-1111-4a2b-8c3d-000000000002";
const PER = "3f1c1d1e-1111-4a2b-8c3d-000000000003";

describe("parseAmount", () => {
  it.each([
    ["25", 25],
    ["12.5", 12.5],
    ["12,50", 12.5],
    ["1,234.56", 1234.56],
    ["S/ 60", 60],
  ])("%s → %d", (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it.each(["", "0", "-5", "abc", "1.234", "12.345"])("rechaza %s", (raw) =>
    expect(parseAmount(raw)).toBeNull(),
  );
});

describe("transactionSchema", () => {
  it("un gasto en soles: amount_pen = amount, sin tipo de cambio", () => {
    const r = transactionSchema.parse({ kind: "gasto", amount: "25", account_id: ACC, category_id: CAT });
    expect(r).toMatchObject({ amount: 25, amount_pen: 25, currency: "PEN", fx_rate: null });
  });

  it("un gasto en dólares convierte con el tipo de cambio y guarda el original", () => {
    const r = transactionSchema.parse({
      kind: "gasto", amount: "3.84", currency: "USD", fx_rate: "3.45", account_id: ACC, category_id: CAT,
    });
    expect(r).toMatchObject({ amount: 3.84, currency: "USD", fx_rate: 3.45, amount_pen: 13.25 });
  });

  it("dólares sin tipo de cambio es un error", () => {
    const r = transactionSchema.safeParse({ kind: "gasto", amount: "10", currency: "USD", account_id: ACC, category_id: CAT });
    expect(r.success).toBe(false);
  });

  it("un gasto exige categoría; Me yapearon exige persona y no lleva categoría", () => {
    expect(transactionSchema.safeParse({ kind: "gasto", amount: "10", account_id: ACC }).success).toBe(false);
    expect(transactionSchema.safeParse({ kind: "reembolso", amount: "10", account_id: ACC }).success).toBe(false);
    const r = transactionSchema.parse({ kind: "reembolso", amount: "60", account_id: ACC, person_id: PER, category_id: CAT });
    expect(r.category_id).toBeNull();
    expect(r.person_id).toBe(PER);
  });
});
