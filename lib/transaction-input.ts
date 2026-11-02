// Validación del formulario de movimientos (registro rápido y edición). Pura y testeable.
import { z } from "zod";
import { round2 } from "@/lib/finance";

/** "1,234.56", "25", "12.5" y también "12,50" (coma decimal) → número. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s|S\/|US\$|\$/g, "");
  if (s.includes(",") && !s.includes(".") && /,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 10_000_000_000 ? n : null;
}

const uuid = z.uuid({ error: "Dato inválido" });
const optionalUuid = z.preprocess((v) => (v === "" ? undefined : v), uuid.optional());

export const transactionSchema = z
  .object({
    id: optionalUuid,
    kind: z.enum(["gasto", "ingreso", "reembolso"]),
    amount: z.string().transform((v, ctx) => {
      const n = parseAmount(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "Escribe un monto válido" });
        return z.NEVER;
      }
      return n;
    }),
    currency: z.enum(["PEN", "USD"]).default("PEN"),
    fx_rate: z.preprocess(
      (v) => (v === "" || v == null ? undefined : Number(v)),
      z.number({ error: "Tipo de cambio inválido" }).positive("Tipo de cambio inválido").optional(),
    ),
    account_id: uuid,
    category_id: optionalUuid,
    person_id: optionalUuid,
    note: z.string().trim().max(200, "Máximo 200 caracteres").optional().default(""),
    occurred_at: z.string().optional().default(""),
    tags: z.array(z.string().regex(/^[a-z0-9_]+$/)).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.currency === "USD" && !v.fx_rate)
      ctx.addIssue({ code: "custom", path: ["fx_rate"], message: "Falta el tipo de cambio" });
    if (v.kind !== "reembolso" && !v.category_id)
      ctx.addIssue({ code: "custom", path: ["category_id"], message: "Elige una categoría" });
    if (v.kind === "reembolso" && !v.person_id)
      ctx.addIssue({ code: "custom", path: ["person_id"], message: "¿Quién te yapeó?" });
    if (v.occurred_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.occurred_at))
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "Fecha inválida" });
  })
  .transform((v) => ({
    ...v,
    fx_rate: v.currency === "USD" ? v.fx_rate! : null,
    amount_pen: v.currency === "USD" ? round2(v.amount * v.fx_rate!) : v.amount,
    category_id: v.kind === "reembolso" ? null : (v.category_id ?? null),
    person_id: v.person_id ?? null,
  }));

export type TransactionInput = z.output<typeof transactionSchema>;

export function formDataToTransactionInput(fd: FormData) {
  const obj: Record<string, unknown> = Object.fromEntries(
    [...fd.entries()].filter(([k]) => k !== "tags"),
  );
  obj.tags = fd.getAll("tags").map(String);
  return transactionSchema.safeParse(obj);
}
