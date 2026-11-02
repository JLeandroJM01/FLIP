import { describe, expect, it } from "vitest";
import { findDuplicate, matchPerson, matchRule, resolveAccount, type DupCandidate, type RuleLite } from "@/lib/ingest/match";

const accounts = [
  { id: "sueldo", type: "corriente", last4: "2046", card_last4: null },
  { id: "ahorros", type: "ahorros", last4: "6060", card_last4: "4039" },
  { id: "visa", type: "credito", last4: "6129", card_last4: null },
  { id: "efectivo", type: "billetera", last4: null, card_last4: null },
];

describe("resolveAccount", () => {
  it("por últimos 4, tarjeta de débito, sufijo de Yape, Yape y efectivo", () => {
    expect(resolveAccount({ last4: "2046" }, accounts, "ahorros")).toBe("sueldo");
    expect(resolveAccount({ last4: "6129" }, accounts, "ahorros")).toBe("visa");
    expect(resolveAccount({ cardLast4: "4039" }, accounts, "ahorros")).toBe("ahorros");
    expect(resolveAccount({ last4Suffix: "060" }, accounts, "ahorros")).toBe("ahorros");
    expect(resolveAccount({ kind: "yape" }, accounts, "ahorros")).toBe("ahorros");
    expect(resolveAccount({ kind: "efectivo" }, accounts, "ahorros")).toBe("efectivo");
  });
  it("si no conoce la cuenta, no adivina", () => {
    expect(resolveAccount({ last4: "9999" }, accounts, "ahorros")).toBeNull();
  });
});

const rule = (pattern: string, match_type: RuleLite["match_type"], category_id: string, extra: Partial<RuleLite> = {}): RuleLite => ({
  pattern, match_type, category_id, tags: [], requires_review: false, priority: 10, ...extra,
});
const rules = [
  rule("APPLE.COM/BILL", "contiene", "suscripciones", { tags: ["suscripcion", "usd"] }),
  rule("VENDOMATICA", "contiene", "snacks", { tags: ["hormiga"] }),
  rule("Metropolitano", "contiene", "transporte", { tags: ["fijo"] }),
  rule("PLIN-", "empieza_con", "pago_persona", { requires_review: true, priority: 20 }),
];

describe("matchRule (reglas de la sección 7)", () => {
  it("sin distinguir mayúsculas", () => {
    expect(matchRule("Metropolitano y Corredores", rules)?.category_id).toBe("transporte");
    expect(matchRule("APPLE.COM/BILL", rules)?.tags).toEqual(["suscripcion", "usd"]);
    expect(matchRule("plin-JUAN PEREZ", rules)?.requires_review).toBe(true);
  });
  it("'empieza con' no coincide en medio del texto", () => {
    expect(matchRule("PAGO PLIN-X", rules)).toBeNull();
  });
  it("sin regla, sin categoría", () => {
    expect(matchRule("DELICASS", rules)).toBeNull();
    expect(matchRule(null, rules)).toBeNull();
  });
});

describe("matchPerson", () => {
  const people = [
    { id: "daniela", name: "Daniela", alias: null },
    { id: "walter", name: "Walter", alias: null },
    { id: "juan", name: "Juan", alias: "JUAN PEREZ" },
  ];
  it("por nombre como palabra o por alias", () => {
    expect(matchPerson("Gomez Rojas Walter E", people)).toBe("walter");
    expect(matchPerson("JUAN PEREZ GO", people)).toBe("juan");
  });
  it("no adivina", () => {
    expect(matchPerson("ADDERLY ARMANDO DA", people)).toBeNull();
    expect(matchPerson("Walteriano", people)).toBeNull();
  });
});

describe("findDuplicate (SPEC 3.2)", () => {
  const at = (t: string) => `2026-11-01T${t}:00-05:00`;
  const c = (x: Partial<DupCandidate>): DupCandidate => ({
    id: "c", type: "gasto", amount_pen: 17.9, occurred_at: at("20:15"), external_op_id: null, parser: "yape_promos", ...x,
  });
  const input = { type: "gasto", amountPen: 17.9, occurredAt: new Date(at("20:15")), externalOpId: null, parser: "yape_compra" };

  it("mismo número de operación = duplicado", () => {
    expect(findDuplicate({ ...input, externalOpId: "123", parser: "consumo_credito" }, [c({ external_op_id: "123", parser: "consumo_credito", occurred_at: at("23:00") })])).not.toBeNull();
  });
  it("mismo monto y cuenta en ± 10 min, de otro formato = duplicado (Yape Promos + Norky's)", () => {
    expect(findDuplicate(input, [c({})])?.id).toBe("c");
  });
  it("fuera de los 10 minutos no", () => {
    expect(findDuplicate(input, [c({ occurred_at: at("20:30") })])).toBeNull();
  });
  it("dos consumos iguales del mismo formato con operaciones distintas no son duplicados", () => {
    const vendo = { type: "gasto", amountPen: 1.5, occurredAt: new Date(at("17:06")), externalOpId: "222", parser: "consumo_credito" };
    expect(findDuplicate(vendo, [c({ amount_pen: 1.5, occurred_at: at("17:02"), external_op_id: "111", parser: "consumo_credito" })])).toBeNull();
  });
  it("un correo que llega después de registrarlo a mano es duplicado", () => {
    expect(findDuplicate({ ...input, externalOpId: "999", parser: "yape_servicio" }, [c({ parser: null })])).not.toBeNull();
  });
});
