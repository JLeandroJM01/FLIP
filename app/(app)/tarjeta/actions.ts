"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/(app)/actions";
import { requireUser } from "@/lib/auth";
import type { CardStatementSetting } from "@/lib/projection-data";
import type { Json } from "@/lib/supabase/database.types";

const money = z.preprocess((v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", "."))), z.number().min(0, "Monto inválido"));
const schema = z.object({ due: z.iso.date("Fecha inválida"), pen: money, usd: money });

/** Monto real del estado de cuenta (SPEC 10): reemplaza al estimado de ese vencimiento. */
export async function saveCardStatement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const { data } = await supabase.from("settings").select("value").eq("key", "card_statements").maybeSingle();
  const list = ((data?.value ?? []) as CardStatementSetting[]).filter((s) => s.due !== parsed.data.due);
  list.push({ ...parsed.data, source: "estado de cuenta" });
  list.sort((a, b) => a.due.localeCompare(b.due));
  const { error } = await supabase.from("settings").upsert({ key: "card_statements", value: list as unknown as NonNullable<Json>, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: "No se pudo guardar" };
  revalidatePath("/", "layout");
  return { ok: true, savedAt: Date.now(), message: "Estado de cuenta guardado" };
}
