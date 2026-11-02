// Sueldo automático y tarea diaria contra el Supabase local (npm run test:db).
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/diario/route";
import { registerAutoDebits, registerIncomeEvents, registerSalaryPayments } from "@/lib/ingest/recurring";
import type { Database } from "@/lib/supabase/database.types";

const db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function cleanup() {
  const { data } = await db.from("income_events").select("actual_transaction_id");
  await db.from("income_events").delete().not("id", "is", null);
  const ids = (data ?? []).map((e) => e.actual_transaction_id).filter(Boolean) as string[];
  if (ids.length) await db.from("transactions").delete().in("id", ids);
}
afterAll(cleanup);

describe("sueldo automático (SPEC 9.5)", () => {
  it("el 5 nov registra los 6 días de octubre en la cuenta sueldo, una sola vez", async () => {
    await cleanup();
    expect(await registerSalaryPayments(db, "2026-11-05", 0)).toEqual({ registered: 1 });
    expect(await registerSalaryPayments(db, "2026-11-05", 0)).toEqual({ registered: 0 });
    const { data: tx } = await db
      .from("transactions")
      .select("amount_pen, type, source, status, account:accounts!transactions_account_id_fkey(name), category:categories(name)")
      .eq("source", "recurrente")
      .single();
    expect(tx).toMatchObject({ amount_pen: 832.88, type: "ingreso", status: "confirmado" });
    expect((tx!.account as { name: string }).name).toBe("Cuenta corriente soles");
    expect((tx!.category as { name: string }).name).toBe("Sueldo");
  });

  it("si el cron se salta días, los recupera (20 nov visto el 22)", async () => {
    expect(await registerSalaryPayments(db, "2026-11-22", 7)).toEqual({ registered: 1 });
    const { data } = await db.from("income_events").select("expected_date, expected_amount").eq("kind", "sueldo").order("expected_date");
    expect(data).toEqual([
      { expected_date: "2026-11-05", expected_amount: 832.88 },
      { expected_date: "2026-11-20", expected_amount: 2392.5 },
    ]);
  });
});

describe("GET /api/cron/diario", () => {
  it("sin el secreto de Vercel responde 401", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/diario"));
    expect(res.status).toBe(401);
  });
});

describe("ingresos y cobros automáticos (SPEC 9 y 11)", () => {
  it("gratificación de diciembre el 15 (S/ 1,986.44), una sola vez", async () => {
    expect(await registerIncomeEvents(db, "2026-12-15", 0)).toEqual({ registered: 1 });
    expect(await registerIncomeEvents(db, "2026-12-15", 0)).toEqual({ registered: 0 });
    const { data } = await db.from("income_events").select("kind, expected_amount").eq("expected_date", "2026-12-15").single();
    expect(data).toEqual({ kind: "gratificacion", expected_amount: 1986.44 });
  });

  it("CTS de mayo 2027 va a la cuenta CTS (no líquida)", async () => {
    expect(await registerIncomeEvents(db, "2027-05-20", 0)).toEqual({ registered: 1 });
    const { data } = await db
      .from("income_events")
      .select("kind, tx:transactions(account:accounts!transactions_account_id_fkey(name))")
      .eq("expected_date", "2027-05-20")
      .single();
    expect((data!.tx as unknown as { account: { name: string } }).account.name).toBe("CTS soles");
  });

  it("la cuota del crédito Yape del 28 nov se cobra sola y baja el saldo", async () => {
    const { data: before } = await db.from("debts").select("id, balance, installments_paid, next_due_date").eq("name", "Crédito Yape").single();
    expect(await registerAutoDebits(db, "2026-11-28")).toEqual({ registered: 1 });
    expect(await registerAutoDebits(db, "2026-11-28")).toEqual({ registered: 0 });
    const { data: after } = await db.from("debts").select("balance, installments_paid, next_due_date").eq("id", before!.id).single();
    expect(after).toEqual({ balance: 1937.11, installments_paid: 3, next_due_date: "2026-12-28" });
    // restaurar
    await db.from("debt_payments").delete().eq("debt_id", before!.id);
    await db.from("transactions").delete().eq("type", "pago_deuda").eq("source", "recurrente");
    await db.from("debts").update({ balance: before!.balance, installments_paid: before!.installments_paid, next_due_date: before!.next_due_date }).eq("id", before!.id);
  });
});
