// Decisiones puras de la ingesta (SPEC 3.2 y 7): cuenta, reglas de comercio, personas y duplicados.
import type { AccountRef } from "@/lib/parsers";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ───────── cuentas ─────────

export type AccountLite = { id: string; type: string; last4: string | null; card_last4: string | null };

/** Resuelve la cuenta del correo. `yapeAccountId` = cuenta asociada a Yape (settings.default_accounts.reembolso). */
export function resolveAccount(ref: AccountRef, accounts: AccountLite[], yapeAccountId: string | null): string | null {
  if ("last4" in ref) {
    return (accounts.find((a) => a.last4 === ref.last4) ?? accounts.find((a) => a.card_last4 === ref.last4))?.id ?? null;
  }
  if ("cardLast4" in ref) {
    return (accounts.find((a) => a.card_last4 === ref.cardLast4) ?? accounts.find((a) => a.last4 === ref.cardLast4))?.id ?? null;
  }
  if ("last4Suffix" in ref) {
    const matches = accounts.filter((a) => a.last4?.endsWith(ref.last4Suffix));
    return matches.length === 1 ? matches[0].id : null; // si hay dos posibles, no se adivina
  }
  if (ref.kind === "yape") return yapeAccountId;
  return accounts.find((a) => a.type === "billetera")?.id ?? null;
}

// ───────── reglas de comercio ─────────

export type RuleLite = {
  pattern: string;
  match_type: "contiene" | "empieza_con" | "regex";
  category_id: string | null;
  tags: string[];
  requires_review: boolean;
  priority: number;
};

/** La regla de mayor prioridad que coincide con el comercio (sin distinguir mayúsculas ni tildes). */
export function matchRule(merchant: string | null, rules: RuleLite[]): RuleLite | null {
  if (!merchant) return null;
  const m = fold(merchant);
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    const p = fold(r.pattern);
    if (r.match_type === "contiene" && m.includes(p)) return r;
    if (r.match_type === "empieza_con" && m.startsWith(p)) return r;
    if (r.match_type === "regex") {
      try {
        if (new RegExp(r.pattern, "i").test(merchant)) return r;
      } catch {
        // regla mal escrita: se ignora
      }
    }
  }
  return null;
}

// ───────── personas ─────────

export type PersonLite = { id: string; name: string; alias: string | null };

/**
 * Cruza un nombre del correo ("ADDERLY ARMANDO DA", "Gomez Rojas Walter E") con tus personas:
 * por alias (empieza con) o porque el nombre de la persona aparece como palabra.
 * Si coincide más de una, no se adivina.
 */
export function matchPerson(hint: string | null | undefined, people: PersonLite[]): string | null {
  if (!hint) return null;
  const h = fold(hint);
  const words = new Set(h.split(/[^a-z0-9ñ]+/).filter(Boolean));
  const found = people.filter((p) => {
    if (p.alias && h.startsWith(fold(p.alias))) return true;
    const nameWords = fold(p.name).split(/\s+/).filter(Boolean);
    return nameWords.length > 0 && nameWords.every((w) => words.has(w));
  });
  return found.length === 1 ? found[0].id : null;
}

// ───────── duplicados ─────────

export type DupCandidate = {
  id: string;
  type: string;
  amount_pen: number;
  occurred_at: string;
  external_op_id: string | null;
  /** Lector que creó el candidato (null = registro manual). */
  parser: string | null;
};

export type DupInput = {
  type: string;
  amountPen: number;
  occurredAt: Date;
  externalOpId: string | null;
  parser: string;
};

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * SPEC 3.2: mismo número de operación, o mismo monto y cuenta en ± 10 minutos.
 * Dos consumos iguales del MISMO formato con números de operación distintos (dos VENDOMATICA
 * de S/ 1.50) no son duplicados; sí lo son dos correos de formatos distintos de la misma
 * operación (Yape Promos + compra Norky's, pago de servicio + consumo con la tarjeta)
 * y un correo que llega después de un registro manual.
 */
export function findDuplicate(input: DupInput, candidates: DupCandidate[]): DupCandidate | null {
  for (const c of candidates) {
    if (input.externalOpId && c.external_op_id === input.externalOpId) return c;
  }
  for (const c of candidates) {
    if (c.type !== input.type) continue;
    if (Math.abs(c.amount_pen - input.amountPen) > 0.005) continue;
    if (Math.abs(Date.parse(c.occurred_at) - input.occurredAt.getTime()) > TEN_MINUTES) continue;
    const bothHaveOps = !!input.externalOpId && !!c.external_op_id;
    if (bothHaveOps && c.parser === input.parser) continue; // dos operaciones distintas del mismo tipo
    return c;
  }
  return null;
}

/** Comercios genéricos que se reemplazan cuando otro correo trae el real. */
export function isGenericMerchant(merchant: string | null): boolean {
  return !merchant || /^yape promos$/i.test(merchant);
}
