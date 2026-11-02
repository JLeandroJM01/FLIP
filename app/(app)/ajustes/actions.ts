"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/(app)/actions";
import { CATEGORY_ICON_NAMES } from "@/components/category-icon-names";
import { requireUser } from "@/lib/auth";
import { currentYearMonth } from "@/lib/dates";
import type { Json } from "@/lib/supabase/database.types";

const num = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))), schema);
const optionalNum = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), schema.nullable());
const optionalText = z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable());
const day = optionalNum(z.number().int().min(1, "Día 1–31").max(31, "Día 1–31"));
const last4 = z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}$/, "4 dígitos").nullable());

function fail(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { ok: false, fieldErrors, message: "Revisa los datos" };
}

function done(message = "Guardado"): ActionState {
  revalidatePath("/", "layout");
  return { ok: true, message, savedAt: Date.now() };
}

// ───────── Parámetros ─────────

const paramsSchema = z.object({
  uit: num(z.number().positive("UIT inválida")),
  afp_aporte: num(z.number().min(0).max(100)),
  afp_seguro: num(z.number().min(0).max(100)),
  afp_comision: num(z.number().min(0).max(100)),
  shared_prompt_threshold: num(z.number().min(0, "Monto inválido")),
  monthly_budget: num(z.number().min(0, "Monto inválido")),
  default_gasto: z.uuid(),
  default_ingreso: z.uuid(),
  default_reembolso: z.uuid(),
  pay1_day: num(z.number().int().min(1).max(31)),
  pay1_share: num(z.number().min(0).max(100)),
  pay2_day: optionalNum(z.number().int().min(1).max(31)),
  pay2_share: optionalNum(z.number().min(0).max(100)),
});

export async function saveParameters(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = paramsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;

  const share2 = v.pay2_day ? (v.pay2_share ?? 0) : 0;
  if (Math.abs(v.pay1_share + share2 - 100) > 0.01)
    return { ok: false, fieldErrors: { pay1_share: "Los pagos deben sumar 100%" }, message: "Revisa los datos" };

  const { data: uitRow } = await supabase.from("settings").select("value").eq("key", "uit").maybeSingle();
  const uitByYear = { ...((uitRow?.value as Record<string, number>) ?? {}), [currentYearMonth().year]: v.uit };

  const settings: { key: string; value: NonNullable<Json> }[] = [
    { key: "uit", value: uitByYear },
    { key: "afp_rates", value: { aporte: v.afp_aporte / 100, seguro: v.afp_seguro / 100, comision: v.afp_comision / 100 } },
    { key: "shared_prompt_threshold", value: v.shared_prompt_threshold },
    { key: "monthly_budget", value: v.monthly_budget },
    { key: "default_accounts", value: { gasto: v.default_gasto, ingreso: v.default_ingreso, reembolso: v.default_reembolso } },
  ];
  const { error } = await supabase
    .from("settings")
    .upsert(settings.map((s) => ({ ...s, updated_at: new Date().toISOString() })));
  if (error) return { ok: false, message: "No se pudo guardar" };

  // Días de pago (SPEC 9): el segundo pago es del mes siguiente si su día es menor que el primero.
  const schedule: Json[] = [{ day: v.pay1_day, share: v.pay1_share / 100 }];
  if (v.pay2_day && share2 > 0)
    schedule.push({ day: v.pay2_day, share: share2 / 100, ...(v.pay2_day < v.pay1_day ? { month_offset: 1 } : {}) });
  const { data: profile } = await supabase
    .from("income_profile")
    .select("id")
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profile) await supabase.from("income_profile").update({ pay_schedule: schedule }).eq("id", profile.id);

  return done("Parámetros guardados");
}

// ───────── Cuentas ─────────

const accountSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Falta el nombre").max(60),
  last4,
  card_last4: last4,
  credit_limit: optionalNum(z.number().min(0, "Monto inválido")),
  payment_day: day,
  closing_day: day,
  notes: optionalText,
  // "Saldo hoy": si cambia, pasa a ser el nuevo saldo inicial desde este momento.
  balance_now: optionalNum(z.number({ error: "Monto inválido" })),
  balance_original: optionalNum(z.number()),
  is_credit: z.preprocess((v) => v === "1", z.boolean()),
});

export async function saveAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = accountSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error);
  const { id, balance_now, balance_original, is_credit, ...row } = parsed.data;
  const balanceChanged = balance_now !== null && balance_now !== balance_original;
  const { error } = await supabase
    .from("accounts")
    .update({
      ...row,
      ...(balanceChanged && {
        // En la tarjeta se escribe lo usado (positivo) y se guarda como saldo negativo.
        opening_balance: is_credit ? -Math.abs(balance_now) : balance_now,
        opening_balance_at: new Date().toISOString(),
      }),
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.code === "23505" ? "Ya existe una cuenta con ese nombre" : "No se pudo guardar" };
  return done(balanceChanged ? "Cuenta y saldo guardados" : "Cuenta guardada");
}

// ───────── Categorías ─────────

const categorySchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, "Falta el nombre").max(40),
  kind: z.enum(["gasto", "ingreso"]),
  icon: z.enum(CATEGORY_ICON_NAMES as [string, ...string[]]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = categorySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error);
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("categories").update(row).eq("id", id)
    : await supabase.from("categories").insert({ ...row, sort_order: 100 });
  if (error) return { ok: false, message: error.code === "23505" ? "Ya existe esa categoría" : "No se pudo guardar" };
  return done(id ? "Categoría guardada" : "Categoría creada");
}

// ───────── Personas ─────────

const personSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, "Falta el nombre").max(60),
  alias: optionalText,
});

export async function savePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = personSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error);
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("people").update(row).eq("id", id)
    : await supabase.from("people").insert(row);
  if (error) return { ok: false, message: error.code === "23505" ? "Esa persona ya existe" : "No se pudo guardar" };
  return done(id ? "Persona guardada" : "Persona agregada");
}

// ───────── Tipo de cambio manual (respaldo del BCRP) ─────────

const fxSchema = z.object({
  date: z.iso.date("Fecha inválida"),
  usd_pen: num(z.number().positive("Tipo de cambio inválido").max(20, "Tipo de cambio inválido")),
});

export async function saveManualFx(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = fxSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error);
  const { error } = await supabase.from("fx_rates").upsert({ ...parsed.data, source: "manual" });
  if (error) return { ok: false, message: "No se pudo guardar" };
  return done("Tipo de cambio guardado");
}
