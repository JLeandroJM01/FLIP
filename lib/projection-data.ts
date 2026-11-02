import "server-only";
// Datos reales → ProjectionContext (SPEC 14). La usan Metas, Deudas e Inicio.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountBalances, getSettings } from "@/lib/data";
import {
  DEFAULT_AFP_RATES,
  installmentDueDates,
  round2,
  type AfpRates,
  type IncomeCalendar,
  type IncomeEstimates,
  type PayItem,
  type ProjectionContext,
} from "@/lib/finance";
import type { Database } from "@/lib/supabase/database.types";
import type { Catalogs } from "@/lib/types";

type DB = SupabaseClient<Database>;

export type CardStatementSetting = { due: string; pen: number; usd: number; source?: string };

export async function loadProjectionContext(supabase: DB, catalogs: Catalogs, today: string): Promise<ProjectionContext | null> {
  const [{ data: profile }, settings, balances, { data: debts }] = await Promise.all([
    supabase.from("income_profile").select("*").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    getSettings(supabase),
    getAccountBalances(supabase, catalogs),
    supabase.from("debts").select("*"),
  ]);
  if (!profile) return null;

  const projection = (settings.projection ?? {}) as { fx?: number; living?: number };
  const fx = projection.fx ?? 3.45;
  const afpRates = { ...DEFAULT_AFP_RATES, ...((settings.afp_rates ?? {}) as Partial<AfpRates>) };
  const toPen = (amount: number, currency: string) => (currency === "USD" ? amount * fx : amount);

  // Ahorro de partida: saldos líquidos de hoy (corriente, ahorros, efectivo; US$ al tipo de cambio).
  let startCash = 0;
  let ctsStart = 0;
  let afpStart = 0;
  for (const a of catalogs.accounts) {
    const b = balances.get(a.id);
    if (b == null) continue;
    if (["corriente", "ahorros", "billetera"].includes(a.type)) startCash += toPen(b, a.currency);
    if (a.type === "activo" && a.name.toLowerCase().includes("cts")) ctsStart += b;
    if (a.type === "activo" && a.name.toLowerCase().includes("afp")) afpStart += b;
  }

  // Deuda previa de la tarjeta (SPEC 10/11): según los estados de cuenta cargados; el resto, al mes siguiente.
  const statements = (settings.card_statements ?? []) as CardStatementSetting[];
  const card = debts?.find((d) => d.kind === "tarjeta");
  const cardSchedule: Record<string, number> = {};
  if (card && Number(card.balance) > 0) {
    let left = Number(card.balance);
    for (const s of [...statements].sort((a, b) => a.due.localeCompare(b.due))) {
      if (s.due <= today) continue;
      const amount = Math.min(left, s.pen + s.usd * fx);
      if (amount > 0) cardSchedule[s.due.slice(0, 7)] = round2(amount);
      left -= amount;
    }
    if (left > 0.005) {
      const last = Object.keys(cardSchedule).sort().at(-1);
      const [y, m] = (last ?? today.slice(0, 7)).split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      cardSchedule[next] = round2((cardSchedule[next] ?? 0) + left);
    }
  }
  // Intereses de las compras en cuotas (lo que se paga de más), en sus vencimientos.
  for (const d of debts ?? []) {
    if (d.kind !== "cuotas" || !d.external_op_id || !d.installments_total) continue;
    const interest = toPen(Number(d.balance) - Number(d.original_amount ?? d.balance), d.currency) / d.installments_total;
    const pase = d.notes?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? today;
    for (const due of installmentDueDates(pase, d.installments_total, 5)) {
      if (due <= today) continue;
      cardSchedule[due.slice(0, 7)] = round2((cardSchedule[due.slice(0, 7)] ?? 0) + interest);
    }
  }

  const projectionDebts: ProjectionContext["debts"] = [];
  if (Object.keys(cardSchedule).length) projectionDebts.push({ name: "Tarjeta (consumos anteriores)", order: null, balancePen: 0, schedule: cardSchedule });
  for (const d of debts ?? []) {
    // La tarjeta y sus compras en cuotas (las crea el pase a cuotas, con nº de operación) ya van en cardSchedule.
    if (d.kind === "tarjeta" || d.external_op_id || Number(d.balance) <= 0) continue;
    const remaining = d.installments_total ? d.installments_total - d.installments_paid : 0;
    projectionDebts.push({
      name: d.name,
      order: d.payoff_order,
      balancePen: round2(toPen(Number(d.balance), d.currency)),
      ...(remaining > 0 && d.installment_amount && d.next_due_date
        ? { installments: { next: d.next_due_date, remaining, amount: Number(d.installment_amount), annualRate: d.tcea != null ? Number(d.tcea) : null } }
        : {}),
    });
  }

  return {
    today,
    endYm: "2029-11",
    startCash: round2(startCash),
    salary: {
      startDate: profile.start_date,
      endDate: profile.end_date,
      monthlyGross: Number(profile.monthly_gross),
      paySchedule: profile.pay_schedule as PayItem[],
      afpRates,
    },
    income: {
      startDate: profile.start_date,
      endDate: profile.end_date,
      monthlyGross: Number(profile.monthly_gross),
      gratDaysBase: profile.grat_days_base,
      gratBonusRate: Number(profile.grat_bonus_rate),
      profitSharingSalaries: Number(profile.profit_sharing_salaries),
      afpRates,
    },
    taxTable: (settings.monthly_tax_estimate ?? {}) as Record<string, number>,
    calendar: settings.income_calendar as IncomeCalendar,
    estimates: settings.income_estimates as IncomeEstimates,
    bonusMaxSalaries: Number(profile.bonus_salaries_max),
    debts: projectionDebts,
    ctsStart: round2(ctsStart),
    afpStart: round2(afpStart),
  };
}
