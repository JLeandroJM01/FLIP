"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fromLimaDateTimeLocal, limaDateKey } from "@/lib/dates";
import { fetchBcrpRate } from "@/lib/fx/bcrp";
import { formDataToTransactionInput } from "@/lib/transaction-input";
import type { Person, TxStatus } from "@/lib/types";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Cambia en cada envío exitoso para que el formulario se reinicie. */
  savedAt?: number;
};

const TYPE_BY_KIND = { gasto: "gasto", ingreso: "ingreso", reembolso: "reembolso" } as const;

/** Crea o edita un gasto, ingreso o "Me yapearon" (reembolso). */
export async function saveTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = formDataToTransactionInput(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, fieldErrors, message: "Revisa los datos" };
  }
  const v = parsed.data;

  // La categoría debe ser del mismo tipo que el movimiento.
  if (v.category_id) {
    const { data: cat } = await supabase.from("categories").select("kind").eq("id", v.category_id).single();
    if (!cat || cat.kind !== v.kind) return { ok: false, fieldErrors: { category_id: "Categoría inválida" } };
  }

  const row = {
    type: TYPE_BY_KIND[v.kind],
    amount: v.amount,
    currency: v.currency,
    fx_rate: v.fx_rate,
    amount_pen: v.amount_pen,
    account_id: v.account_id,
    category_id: v.category_id,
    person_id: v.person_id,
    note: v.note || null,
    tags: v.tags,
    occurred_at: (v.occurred_at ? fromLimaDateTimeLocal(v.occurred_at) : new Date()).toISOString(),
  };

  const { error } = v.id
    ? await supabase.from("transactions").update(row).eq("id", v.id)
    : await supabase.from("transactions").insert({ ...row, source: "manual", status: "confirmado" });
  if (error) return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };

  if (v.currency === "USD" && v.fx_rate) {
    // Guarda el tipo de cambio manual del día si aún no hay uno (no pisa el del BCRP).
    await supabase
      .from("fx_rates")
      .upsert(
        { date: limaDateKey(new Date(row.occurred_at)), usd_pen: v.fx_rate, source: "manual" },
        { onConflict: "date", ignoreDuplicates: true },
      );
  }

  revalidatePath("/", "layout");
  return { ok: true, savedAt: Date.now(), message: v.id ? "Cambios guardados" : "Registrado" };
}

/** Anular, restaurar o confirmar un movimiento (los "por revisar"). */
export async function setTransactionStatus(id: string, status: TxStatus): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transactions").update({ status }).eq("id", id);
  if (error) return { ok: false, message: "No se pudo actualizar" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Alta rápida de una persona desde "Me yapearon". */
export async function createPerson(name: string): Promise<{ person?: Person; error?: string }> {
  const { supabase } = await requireUser();
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 60) return { error: "Nombre inválido" };
  const { data, error } = await supabase.from("people").insert({ name: clean }).select().single();
  if (error) return { error: error.code === "23505" ? "Esa persona ya existe" : "No se pudo guardar" };
  revalidatePath("/", "layout");
  return { person: data };
}

/** Tipo de cambio del día: primero el guardado, luego el BCRP. null → ingreso manual. */
export async function getFxRate(date: string): Promise<{ rate: number; source: string; date: string } | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("fx_rates")
    .select("date, usd_pen, source")
    .lte("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.date === date) return { rate: Number(data.usd_pen), source: data.source, date: data.date };

  const quote = await fetchBcrpRate(date);
  if (quote) {
    await supabase.from("fx_rates").upsert({ date: quote.date, usd_pen: quote.usdPen, source: "bcrp" });
    return { rate: quote.usdPen, source: "bcrp", date: quote.date };
  }
  return data ? { rate: Number(data.usd_pen), source: data.source, date: data.date } : null;
}
