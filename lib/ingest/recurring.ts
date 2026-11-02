import "server-only";
// Sueldo automático (SPEC 9.5): el BCP no avisa el abono, así que FLIP lo registra en cada día de pago.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AFP_RATES, salaryPaymentsOn, type AfpRates, type PayItem, type SalaryPayment } from "@/lib/finance";
import { formatMonth } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

const PART_LABELS: Record<SalaryPayment["part"], string> = {
  adelanto: "adelanto de",
  resto: "resto de",
  parcial: "días trabajados de",
  unico: "sueldo de",
};

/** Registra los pagos de sueldo de los últimos `lookbackDays` días que falten (si el cron se saltó un día). */
export async function registerSalaryPayments(db: DB, today: string, lookbackDays = 7) {
  const [{ data: profile }, { data: settings }, { data: category }] = await Promise.all([
    db.from("income_profile").select("*").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("settings").select("key, value").in("key", ["afp_rates", "monthly_tax_estimate", "default_accounts"]),
    db.from("categories").select("id").eq("kind", "ingreso").eq("name", "Sueldo").maybeSingle(),
  ]);
  if (!profile) return { registered: 0 };
  const get = (k: string) => settings?.find((s) => s.key === k)?.value as Record<string, unknown> | undefined;
  const taxByPeriod = (get("monthly_tax_estimate") ?? {}) as Record<string, number>;
  const accountId = (get("default_accounts") ?? {}).ingreso as string | undefined;
  if (!accountId) return { registered: 0 };

  // Último monto corregido por el usuario para cada tipo de pago (la boleta real manda).
  const { data: past } = await db
    .from("income_events")
    .select("note, expected_amount, tx:transactions(amount_pen, status)")
    .eq("kind", "sueldo")
    .order("expected_date", { ascending: false })
    .limit(12);
  const realAmount = (part: SalaryPayment["part"]) => {
    const e = past?.find((p) => p.note === part);
    const tx = e?.tx as { amount_pen: number; status: string } | null;
    return tx && tx.status === "confirmado" && Number(tx.amount_pen) !== Number(e!.expected_amount) ? Number(tx.amount_pen) : null;
  };

  const salary = {
    startDate: profile.start_date,
    endDate: profile.end_date,
    monthlyGross: Number(profile.monthly_gross),
    paySchedule: profile.pay_schedule as PayItem[],
    afpRates: { ...DEFAULT_AFP_RATES, ...(get("afp_rates") as Partial<AfpRates> | undefined) },
  };
  const tax = (ym: string) => taxByPeriod[ym] ?? taxByPeriod[ym.slice(0, 4)] ?? 0;

  let registered = 0;
  for (let i = lookbackDays; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    for (const pay of salaryPaymentsOn(date, salary, tax, realAmount)) {
      const { data: exists } = await db.from("income_events").select("id").eq("kind", "sueldo").eq("expected_date", date).maybeSingle();
      if (exists) continue;
      const [y, m] = pay.covers.split("-").map(Number);
      const { data: tx, error } = await db
        .from("transactions")
        .insert({
          occurred_at: `${date}T09:00:00-05:00`,
          amount: pay.amount,
          currency: "PEN",
          amount_pen: pay.amount,
          account_id: accountId,
          type: "ingreso",
          category_id: category?.id ?? null,
          merchant: profile.employer,
          note: `Sueldo: ${PART_LABELS[pay.part]} ${formatMonth(y, m)} (estimado; corrígelo con el monto real)`,
          source: "recurrente",
          status: "confirmado",
        })
        .select("id")
        .single();
      if (error || !tx) continue;
      await db.from("income_events").insert({
        kind: "sueldo",
        expected_date: date,
        expected_amount: pay.amount,
        actual_transaction_id: tx.id,
        note: pay.part,
      });
      registered++;
    }
  }
  return { registered };
}

/** SPEC 16: el texto de los correos se borra a los 90 días; los datos extraídos se quedan. */
export async function purgeOldEmailBodies(db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("raw_emails")
    .update({ body: null })
    .lt("received_at", cutoff)
    .in("parse_status", ["ok", "ignorado"])
    .not("body", "is", null)
    .select("id");
  return { purged: data?.length ?? 0 };
}
