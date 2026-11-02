"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fromLimaDateTimeLocal, limaDateKey } from "@/lib/dates";
import { fetchOfficialRate } from "@/lib/fx";
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

  let error;
  let ruleMessage = "";
  if (v.id) {
    const { data: existing } = await supabase.from("transactions").select("status, merchant").eq("id", v.id).single();
    // Guardar un movimiento "por revisar" es confirmarlo.
    ({ error } = await supabase
      .from("transactions")
      .update({ ...row, ...(existing?.status === "por_revisar" && { status: "confirmado" as const }) })
      .eq("id", v.id));
    // SPEC 7: "¿Aplicar siempre a este comercio?" → crea la regla y categoriza los anteriores sin categoría.
    if (!error && formData.get("apply_rule") === "1" && existing?.merchant && v.category_id) {
      await supabase.from("merchant_rules").insert({
        pattern: existing.merchant,
        match_type: "contiene",
        category_id: v.category_id,
        tags: v.tags,
        priority: 5,
      });
      await supabase
        .from("transactions")
        .update({ category_id: v.category_id })
        .eq("merchant", existing.merchant)
        .is("category_id", null);
      ruleMessage = ` · Regla creada para ${existing.merchant}`;
    }
  } else {
    // "Me yapearon" de un gasto compartido: se liga al gasto y baja lo que esa persona debe.
    const participantId = v.kind === "reembolso" ? String(formData.get("shared_participant_id") ?? "") : "";
    let sharedExpenseId: string | null = null;
    if (participantId) {
      const { data: p } = await supabase
        .from("shared_participants")
        .select("id, shared_expense_id, person_id, amount_owed, amount_paid")
        .eq("id", participantId)
        .single();
      if (p && p.person_id === v.person_id) {
        sharedExpenseId = p.shared_expense_id;
        const paid = Math.min(Number(p.amount_owed), Number(p.amount_paid) + v.amount_pen);
        await supabase.from("shared_participants").update({ amount_paid: paid }).eq("id", p.id);
      }
    }
    ({ error } = await supabase
      .from("transactions")
      .insert({ ...row, source: "manual", status: "confirmado", shared_expense_id: sharedExpenseId }));
  }
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
  return { ok: true, savedAt: Date.now(), message: (v.id ? "Cambios guardados" : "Registrado") + ruleMessage };
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

  const quote = await fetchOfficialRate(date);
  if (quote) {
    await supabase.from("fx_rates").upsert({ date: quote.date, usd_pen: quote.usdPen, source: quote.source ?? "bcrp" });
    return { rate: quote.usdPen, source: "oficial", date: quote.date };
  }
  return data ? { rate: Number(data.usd_pen), source: data.source, date: data.date } : null;
}

/** Un correo que la app no entendió y que no es un movimiento: se marca como ignorado. */
export async function ignoreRawEmail(id: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("raw_emails").update({ parse_status: "ignorado", error: "ignorado a mano" }).eq("id", id);
  if (error) return { ok: false, message: "No se pudo actualizar" };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────── Gastos compartidos (SPEC 8) ─────────

const sharedSchema = z.object({
  transaction_id: z.uuid(),
  my_share: z.number().min(0),
  participants: z
    .array(z.object({ person_id: z.uuid(), amount: z.number().positive("Monto inválido") }))
    .min(1, "Elige al menos una persona"),
  note: z.string().trim().max(200).optional(),
});

/** Marca un gasto como compartido: cuenta solo mi parte; lo demás queda "por cobrar". */
export async function createSharedExpense(input: z.input<typeof sharedSchema>): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = sharedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const v = parsed.data;
  const { data: tx } = await supabase.from("transactions").select("amount_pen, type, shared_expense_id, tags").eq("id", v.transaction_id).single();
  if (!tx || tx.type !== "gasto") return { ok: false, message: "Solo un gasto puede ser compartido" };
  if (tx.shared_expense_id) return { ok: false, message: "Este gasto ya es compartido" };
  const total = Number(tx.amount_pen);
  const others = v.participants.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(others + v.my_share - total) > 0.01) {
    return { ok: false, message: `Tu parte y la de los demás deben sumar ${total.toFixed(2)}` };
  }
  const { data: shared, error } = await supabase
    .from("shared_expenses")
    .insert({ transaction_id: v.transaction_id, total, my_share: v.my_share, note: v.note || null })
    .select("id")
    .single();
  if (error || !shared) return { ok: false, message: "No se pudo guardar" };
  await supabase.from("shared_participants").insert(
    v.participants.map((p) => ({ shared_expense_id: shared.id, person_id: p.person_id, amount_owed: p.amount })),
  );
  await supabase
    .from("transactions")
    .update({ shared_expense_id: shared.id, tags: Array.from(new Set([...(tx.tags ?? []), "compartido"])) })
    .eq("id", v.transaction_id);
  revalidatePath("/", "layout");
  return { ok: true, savedAt: Date.now(), message: `Compartido: tu parte es S/ ${v.my_share.toFixed(2)}` };
}

/** "No fue compartido": no se vuelve a preguntar por este gasto. */
export async function dismissSharedPrompt(transactionId: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ shared_dismissed: true }).eq("id", transactionId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Volver a leer" los correos sin entender o con error (después de corregir un lector o poner un tipo de cambio). */
export async function reprocessEmails(): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { processPendingEmails } = await import("@/lib/ingest/process");
  const r = await processPendingEmails(supabase, { retryErrors: true, retryUnknown: true });
  revalidatePath("/", "layout");
  return { ok: true, message: `Procesados ${r.processed}: ${r.ok} bien, ${r.ignored} ignorados, ${r.unknown} sin entender, ${r.errors} con error` };
}
