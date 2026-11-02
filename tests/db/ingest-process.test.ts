// Procesa TODOS los fixtures contra el Supabase local y revisa el resultado (npm run test:db).
import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processPendingEmails } from "@/lib/ingest/process";
import type { Database } from "@/lib/supabase/database.types";

const db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const PREFIX = "fixture-";
type Tx = Database["public"]["Tables"]["transactions"]["Row"] & {
  account: { name: string } | null;
  category: { name: string } | null;
  raw: { gmail_message_id: string } | null;
};
let txs: Tx[] = [];

async function cleanup() {
  const { data: raws } = await db.from("raw_emails").select("id").like("gmail_message_id", `${PREFIX}%`);
  const ids = (raws ?? []).map((r) => r.id);
  if (ids.length) await db.from("transactions").delete().in("raw_email_id", ids);
  await db.from("raw_emails").delete().like("gmail_message_id", `${PREFIX}%`);
  await db.from("debts").delete().not("external_op_id", "is", null);
  await db.from("fx_rates").delete().eq("date", "2026-11-01");
}

beforeAll(async () => {
  await cleanup();
  // Tipo de cambio conocido para los consumos en US$ (no depende del BCRP en el test).
  await db.from("fx_rates").upsert({ date: "2026-11-01", usd_pen: 3.45, source: "manual" });
  const files = readdirSync("tests/fixtures/emails").filter((f) => f.endsWith(".txt"));
  // Orden de llegada: la fecha del correo es la del propio mensaje (aprox.)
  const rows = files.map((f, i) => {
    const raw = readFileSync(`tests/fixtures/emails/${f}`, "utf8");
    const [first, ...rest] = raw.split("\n");
    return {
      gmail_message_id: `${PREFIX}${f}`,
      subject: first.replace(/^Subject: /, ""),
      body: rest.join("\n"),
      received_at: new Date(Date.UTC(2026, 9, 20, 0, i)).toISOString(),
      from_address: "test",
    };
  });
  await db.from("raw_emails").insert(rows);
  const summary = await processPendingEmails(db);
  expect(summary.processed).toBe(files.length);
  const { data } = await db
    .from("transactions")
    .select("*, account:accounts!transactions_account_id_fkey(name), category:categories(name), raw:raw_emails(gmail_message_id)")
    .not("raw_email_id", "is", null);
  txs = (data ?? []) as unknown as Tx[];
});
afterAll(cleanup);

const byFixture = (name: string) => txs.filter((t) => t.raw?.gmail_message_id === `${PREFIX}${name}.txt`);
const one = (name: string) => {
  const list = byFixture(name);
  expect(list, name).toHaveLength(1);
  return list[0];
};
async function rawStatus(name: string) {
  const { data } = await db.from("raw_emails").select("parse_status, parser, error").eq("gmail_message_id", `${PREFIX}${name}.txt`).single();
  return data!;
}

describe("ingesta de punta a punta", () => {
  it("consumo con la Visa: categoría por regla o sin categoría, confirmado", () => {
    const t = one("consumo_credito");
    expect(t).toMatchObject({ type: "gasto", amount_pen: 70, status: "confirmado", source: "gmail", external_op_id: "0000161072" });
    expect(t.account?.name).toBe("Visa Oro LATAM Pass");
    expect(t.category).toBeNull(); // AQUA HOTEL no tiene regla: queda para revisar la categoría
  });

  it("consumo en US$ (Apple): convierte con el tipo de cambio y aplica la regla", () => {
    const t = one("consumo_credito_usd");
    expect(t).toMatchObject({ currency: "USD", amount: 3.84, fx_rate: 3.45, amount_pen: 13.25, tags: ["suscripcion", "usd"] });
    expect(t.category?.name).toBe("Suscripciones");
  });

  it("PLIN- va a Por revisar como Pago a persona, en la cuenta de ahorros", () => {
    const t = one("consumo_debito_plin");
    expect(t).toMatchObject({ status: "por_revisar" });
    expect(t.account?.name).toBe("Cuenta de ahorros soles");
    expect(t.category?.name).toBe("Pago a persona");
  });

  it("transferencia entre mis cuentas: de la corriente a la de ahorros, no es gasto", async () => {
    const t = one("transferencia_propia");
    expect(t).toMatchObject({ type: "transferencia", amount_pen: 600, status: "confirmado" });
    expect(t.account?.name).toBe("Cuenta corriente soles");
  });

  it("pago de tarjeta: de la cuenta sueldo a la Visa", () => {
    const t = one("pago_tarjeta");
    expect(t).toMatchObject({ type: "pago_tarjeta", amount_pen: 300, status: "confirmado" });
    expect(t.account?.name).toBe("Cuenta corriente soles");
  });

  it("transferencia a terceros: por revisar y cruza con Walter", async () => {
    const t = one("transferencia_terceros");
    expect(t.status).toBe("por_revisar");
    const { data: walter } = await db.from("people").select("id").eq("name", "Walter").single();
    expect(t.person_id).toBe(walter!.id);
  });

  it("pago de servicio CLARO: Servicios #fijo con la Visa", () => {
    const t = one("pago_servicio");
    expect(t.category?.name).toBe("Servicios");
    expect(t.tags).toEqual(["fijo"]);
    expect(t.account?.name).toBe("Visa Oro LATAM Pass");
  });

  it("Metropolitano: Transporte #fijo desde la cuenta de Yape", () => {
    const t = one("yape_servicio");
    expect(t.category?.name).toBe("Transporte");
    expect(t.account?.name).toBe("Cuenta de ahorros soles");
  });

  it("retiro: retiro_efectivo de ****6060 hacia Efectivo, categoría Efectivo", () => {
    const t = one("retiro_agente");
    expect(t).toMatchObject({ type: "retiro_efectivo", amount_pen: 200, status: "confirmado" });
    expect(t.category?.name).toBe("Efectivo");
  });

  it("Yape Promos + compra Norky's = un solo gasto con el comercio real", () => {
    const both = [...byFixture("yape_promos"), ...byFixture("yape_compra")];
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ amount_pen: 17.9, merchant: "Norky's" });
  });

  it("depósito recibido: ingreso por revisar en la cuenta de ahorros", () => {
    const t = one("yape_deposito");
    expect(t).toMatchObject({ type: "ingreso", amount_pen: 50, status: "por_revisar", merchant: "Betsafe" });
  });

  it("devolución sin gasto original: ingreso por revisar", () => {
    expect(one("devolucion")).toMatchObject({ type: "ingreso", status: "por_revisar", amount_pen: 500 });
  });

  it("pase a cuotas: crea deudas (no gastos) y no se duplica", async () => {
    expect(byFixture("pase_cuotas")).toHaveLength(0);
    const { data: debts } = await db.from("debts").select("name, kind, installments_total, installment_amount, balance, currency").not("external_op_id", "is", null).order("currency");
    expect(debts).toEqual([
      { name: "Cuotas: MUSIC ENTERTAINMENT EI LIMA PE", kind: "cuotas", installments_total: 3, installment_amount: 408.23, balance: 1224.69, currency: "PEN" },
      expect.objectContaining({ kind: "cuotas", currency: "USD", installments_total: 3 }),
    ]);
  });

  it("rechazo y configuración se ignoran; nada queda con error", async () => {
    expect(byFixture("rechazo")).toHaveLength(0);
    expect((await rawStatus("rechazo")).parse_status).toBe("ignorado");
    expect((await rawStatus("configuracion")).parse_status).toBe("ignorado");
    const { data: errors } = await db.from("raw_emails").select("gmail_message_id, error").like("gmail_message_id", `${PREFIX}%`).in("parse_status", ["error", "desconocido"]);
    expect(errors).toEqual([]);
  });

  it("volver a procesar no duplica nada", async () => {
    await db.from("raw_emails").update({ parse_status: "pendiente" }).like("gmail_message_id", `${PREFIX}%`);
    await processPendingEmails(db);
    const { count } = await db.from("transactions").select("id", { count: "exact", head: true }).not("raw_email_id", "is", null);
    expect(count).toBe(txs.length);
  });
});
