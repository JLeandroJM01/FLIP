import "server-only";
// Procesa los correos guardados en raw_emails (SPEC 3): lector → cuenta → reglas → duplicados → movimiento.
// Se ejecuta en cada POST /api/ingest y en la tarea diaria (reintenta los que fallaron).
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/finance";
import { fetchOfficialRate } from "@/lib/fx";
import { limaDateKey } from "@/lib/dates";
import { parseEmail, PARSER_VERSION, type ParsedTx, type ParseResult } from "@/lib/parsers";
import type { Database } from "@/lib/supabase/database.types";
import { findDuplicate, isGenericMerchant, matchPerson, matchRule, resolveAccount, type DupCandidate } from "./match";

type DB = SupabaseClient<Database>;
type RawEmail = Pick<Database["public"]["Tables"]["raw_emails"]["Row"], "id" | "subject" | "body" | "received_at">;
type Outcome = { status: "ok" | "ignorado" | "desconocido" | "error"; parser: string; message?: string };

export type ProcessSummary = { processed: number; ok: number; ignored: number; unknown: number; errors: number };

async function loadContext(db: DB) {
  const [accounts, categories, rules, people, defaults] = await Promise.all([
    db.from("accounts").select("id, type, last4, card_last4"),
    db.from("categories").select("id, name, kind"),
    db.from("merchant_rules").select("pattern, match_type, category_id, tags, requires_review, priority"),
    db.from("people").select("id, name, alias"),
    db.from("settings").select("value").eq("key", "default_accounts").maybeSingle(),
  ]);
  const categoryByName = (name: string, kind: "gasto" | "ingreso" = "gasto") =>
    categories.data?.find((c) => c.name === name && c.kind === kind)?.id ?? null;
  return {
    accounts: accounts.data ?? [],
    rules: rules.data ?? [],
    people: people.data ?? [],
    // La cuenta de Yape es la misma donde entran los "Me yapearon" (SPEC 4).
    yapeAccountId: ((defaults.data?.value ?? {}) as Record<string, string>).reembolso ?? null,
    categoryByName,
  };
}
type Context = Awaited<ReturnType<typeof loadContext>>;

/** Tipo de cambio del día del movimiento: guardado, BCRP o el último guardado antes de esa fecha. */
async function fxRateFor(db: DB, date: Date): Promise<number | null> {
  const day = limaDateKey(date);
  const { data } = await db
    .from("fx_rates")
    .select("date, usd_pen")
    .lte("date", day)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.date === day) return Number(data.usd_pen);
  const quote = await fetchOfficialRate(day);
  if (quote) {
    await db.from("fx_rates").upsert({ date: quote.date, usd_pen: quote.usdPen, source: quote.source ?? "bcrp" });
    return quote.usdPen;
  }
  if (data) return Number(data.usd_pen);
  // Sin dato anterior: el más cercano posterior (p. ej. uno manual de Ajustes).
  const { data: after } = await db.from("fx_rates").select("usd_pen").gt("date", day).order("date").limit(1).maybeSingle();
  return after ? Number(after.usd_pen) : null;
}

async function saveTransaction(db: DB, ctx: Context, raw: RawEmail, parser: string, tx: ParsedTx): Promise<Outcome> {
  const accountId = resolveAccount(tx.account, ctx.accounts, ctx.yapeAccountId);
  if (!accountId) return { status: "error", parser, message: `cuenta desconocida: ${JSON.stringify(tx.account)}` };
  const counterpartId = tx.counterpart ? resolveAccount(tx.counterpart, ctx.accounts, ctx.yapeAccountId) : null;
  if (tx.counterpart && !counterpartId) {
    return { status: "error", parser, message: `cuenta destino desconocida: ${JSON.stringify(tx.counterpart)}` };
  }

  let fxRate: number | null = null;
  let amountPen = tx.amount;
  if (tx.currency === "USD") {
    fxRate = tx.fxRate ?? (await fxRateFor(db, tx.occurredAt));
    if (!fxRate) return { status: "error", parser, message: "sin tipo de cambio (se reintenta)" };
    amountPen = tx.amountPen ?? round2(tx.amount * fxRate);
  }

  const rule = matchRule(tx.merchant, ctx.rules);
  const kind = tx.type === "ingreso" ? "ingreso" : "gasto";
  const categoryId = tx.categoryName
    ? ctx.categoryByName(tx.categoryName, kind)
    : ["gasto", "ingreso"].includes(tx.type)
      ? (rule?.category_id ?? null)
      : null;
  const personId = matchPerson(tx.personHint, ctx.people);

  // ¿Ya existe? (SPEC 3.2): mismo número de operación o mismo monto/cuenta en ± 10 minutos.
  const from = new Date(tx.occurredAt.getTime() - 10 * 60 * 1000).toISOString();
  const to = new Date(tx.occurredAt.getTime() + 10 * 60 * 1000).toISOString();
  const opFilter = tx.externalOpId ? `,external_op_id.eq.${tx.externalOpId}` : "";
  const { data: near } = await db
    .from("transactions")
    .select("id, type, amount_pen, occurred_at, external_op_id, merchant, category_id, raw:raw_emails(parser)")
    .eq("account_id", accountId)
    .neq("status", "anulado")
    .or(`and(occurred_at.gte.${from},occurred_at.lte.${to})${opFilter}`);
  const candidates: (DupCandidate & { merchant: string | null; category_id: string | null })[] = (near ?? []).map((c) => ({
    id: c.id,
    type: c.type,
    amount_pen: Number(c.amount_pen),
    occurred_at: c.occurred_at,
    external_op_id: c.external_op_id,
    parser: (c.raw as { parser: string | null } | null)?.parser ?? null,
    merchant: c.merchant,
    category_id: c.category_id,
  }));
  const dup = findDuplicate({ type: tx.type, amountPen, occurredAt: tx.occurredAt, externalOpId: tx.externalOpId, parser }, candidates);
  if (dup) {
    // Se queda el primero; si este correo trae un comercio mejor (Norky's en vez de "Yape Promos"), se completa.
    const existing = candidates.find((c) => c.id === dup.id)!;
    const patch: Database["public"]["Tables"]["transactions"]["Update"] = {};
    if (isGenericMerchant(existing.merchant) && tx.merchant && !isGenericMerchant(tx.merchant)) {
      patch.merchant = tx.merchant;
      if (!existing.category_id && categoryId) patch.category_id = categoryId;
      if (rule?.tags.length) patch.tags = rule.tags;
    }
    if (!existing.external_op_id && tx.externalOpId) patch.external_op_id = tx.externalOpId;
    if (Object.keys(patch).length) await db.from("transactions").update(patch).eq("id", dup.id);
    return { status: "ok", parser, message: `duplicado de ${dup.id}` };
  }

  const needsReview = !!tx.review || !!rule?.requires_review;
  const { error } = await db.from("transactions").insert({
    occurred_at: tx.occurredAt.toISOString(),
    amount: tx.amount,
    currency: tx.currency,
    fx_rate: fxRate,
    amount_pen: amountPen,
    account_id: accountId,
    counterpart_account_id: counterpartId,
    type: tx.type,
    category_id: categoryId,
    merchant: tx.merchant,
    note: tx.note ?? null,
    tags: rule?.tags ?? [],
    source: "gmail",
    external_op_id: tx.externalOpId,
    raw_email_id: raw.id,
    status: needsReview ? "por_revisar" : "confirmado",
    person_id: personId,
  });
  if (error) return { status: "error", parser, message: `no se pudo guardar: ${error.message}` };
  return { status: "ok", parser };
}

/** Formato 9: busca el gasto original (mismo comercio y monto, últimos 30 días) y lo anula. */
async function applyReversal(db: DB, ctx: Context, raw: RawEmail, parser: string, r: Extract<ParseResult, { kind: "reversal" }>): Promise<Outcome> {
  const accountId = resolveAccount(r.account, ctx.accounts, ctx.yapeAccountId);
  if (!accountId) return { status: "error", parser, message: "cuenta desconocida en la devolución" };
  // Si este correo ya se leyó antes (sin encontrar el original), se quita lo que creó y se vuelve a intentar.
  await db.from("transactions").delete().eq("raw_email_id", raw.id).eq("status", "por_revisar");
  const since = new Date(r.occurredAt.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: originals } = await db
    .from("transactions")
    .select("id, merchant, note")
    .eq("account_id", accountId)
    .eq("type", "gasto")
    .in("status", ["confirmado", "por_revisar"])
    .eq("amount", r.amount)
    .gte("occurred_at", since)
    .lte("occurred_at", r.occurredAt.toISOString())
    .order("occurred_at", { ascending: false });
  const original = (originals ?? []).find((o) => (o.merchant ?? "").toLowerCase() === (r.merchant ?? "").toLowerCase());
  const when = limaDateKey(r.occurredAt);
  if (original) {
    await db
      .from("transactions")
      .update({ status: "anulado", note: [original.note, `Devuelto el ${when}`].filter(Boolean).join(" · ") })
      .eq("id", original.id);
    return { status: "ok", parser, message: `anula ${original.id}` };
  }
  // No se encontró el original: entra como ingreso por revisar (SPEC 5, formato 9).
  return saveTransaction(db, ctx, raw, parser, {
    type: "ingreso",
    amount: r.amount,
    currency: r.currency,
    occurredAt: r.occurredAt,
    account: r.account,
    merchant: r.merchant,
    externalOpId: r.externalOpId,
    note: "Devolución sin gasto original",
    review: true,
  });
}

/** Formato 11: el consumo ya se contó; se registra la deuda en cuotas de la tarjeta. */
async function saveInstallments(db: DB, ctx: Context, parser: string, r: Extract<ParseResult, { kind: "installments" }>): Promise<Outcome> {
  const accountId = resolveAccount(r.account, ctx.accounts, ctx.yapeAccountId);
  const total = round2(r.installmentAmount * r.installments);
  const tea = r.tea != null ? `TEA ${(r.tea * 100).toFixed(2)}%` : null;
  const { error } = await db.from("debts").upsert(
    {
      name: `Cuotas: ${r.merchant ?? "compra con tarjeta"}`,
      kind: "cuotas",
      account_id: accountId,
      currency: r.currency,
      original_amount: r.originalAmount,
      balance: total,
      installment_amount: r.installmentAmount,
      installments_total: r.installments,
      installments_paid: 0,
      external_op_id: r.externalOpId,
      notes: [`Pase a cuotas del ${limaDateKey(r.occurredAt)}`, tea, `~${round2(total - r.originalAmount)} de intereses`]
        .filter(Boolean)
        .join(" · "),
    },
    { onConflict: "external_op_id", ignoreDuplicates: true },
  );
  if (error) return { status: "error", parser, message: `no se pudo guardar la deuda: ${error.message}` };
  return { status: "ok", parser };
}

async function processOne(db: DB, ctx: Context, raw: RawEmail): Promise<Outcome> {
  const { parser, result } = parseEmail({ subject: raw.subject ?? "", body: raw.body ?? "" });
  switch (result.kind) {
    case "ignore":
      return { status: "ignorado", parser, message: result.reason };
    case "unknown":
      return { status: "desconocido", parser, message: result.reason };
    case "reversal":
      return applyReversal(db, ctx, raw, parser, result);
    case "installments":
      return saveInstallments(db, ctx, parser, result);
    case "transactions": {
      const outcomes = [];
      for (const tx of result.txs) outcomes.push(await saveTransaction(db, ctx, raw, parser, tx));
      return outcomes.find((o) => o.status === "error") ?? outcomes[0];
    }
  }
}

export type ProcessOptions = {
  /** Reintentar los que fallaron (p. ej. sin tipo de cambio). Lo hacen la tarea diaria y Ajustes, no cada ingesta. */
  retryErrors?: boolean;
  /** Volver a leer los desconocidos con una versión anterior del lector. */
  retryUnknown?: boolean;
  limit?: number;
};

/** Procesa los correos pendientes (y, si se pide, los que fallaron), del más antiguo al más nuevo. */
export async function processPendingEmails(db: DB, options: ProcessOptions = {}): Promise<ProcessSummary> {
  const { retryErrors = false, retryUnknown = false, limit = 200 } = options;
  const filters = ["parse_status.eq.pendiente"];
  if (retryErrors) filters.push("parse_status.eq.error");
  if (retryUnknown) {
    filters.push(`and(parse_status.eq.desconocido,parser_version.neq.${PARSER_VERSION})`);
    // Devoluciones leídas con una versión anterior (antes solo buscaban el original entre los confirmados).
    filters.push(`and(parser.eq.devolucion,parser_version.neq.${PARSER_VERSION})`);
  }
  const { data: pending } = await db
    .from("raw_emails")
    .select("id, subject, body, received_at")
    .or(filters.join(","))
    .order("received_at", { ascending: true })
    .limit(limit);
  const summary: ProcessSummary = { processed: 0, ok: 0, ignored: 0, unknown: 0, errors: 0 };
  if (!pending?.length) return summary;

  const ctx = await loadContext(db);
  for (const raw of pending) {
    const outcome = await processOne(db, ctx, raw).catch(
      (e: Error): Outcome => ({ status: "error", parser: "?", message: e.message }),
    );
    await db
      .from("raw_emails")
      .update({
        parse_status: outcome.status,
        parser: outcome.parser,
        parser_version: PARSER_VERSION,
        error: outcome.message ?? null,
      })
      .eq("id", raw.id);
    summary.processed++;
    if (outcome.status === "ok") summary.ok++;
    else if (outcome.status === "ignorado") summary.ignored++;
    else if (outcome.status === "desconocido") summary.unknown++;
    else summary.errors++;
  }
  return summary;
}
