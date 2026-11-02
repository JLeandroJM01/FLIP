// Lectores de correos del BCP y Yape (SPEC 5). Funciones puras: texto → qué pasó.
// La decisión de cuenta, categoría y duplicados la toma lib/ingest/process.ts.
import type { CurrencyCode, TxType } from "@/lib/types";
import { parseEmailDate } from "./dates";
import { parseMoney, parsePercent, parseRate, type Money } from "./money";
import { cleanMerchant, field, last4After, normalizeBody } from "./text";

/** Subir cuando cambie la lógica: permite volver a leer correos viejos (SPEC 3.2). */
export const PARSER_VERSION = "1";

/** Cómo identificar la cuenta: últimos 4 de la cuenta/tarjeta, tarjeta de débito asociada, Yape o efectivo. */
export type AccountRef =
  | { last4: string }
  | { cardLast4: string }
  | { last4Suffix: string } // Yape muestra "**** 060"
  | { kind: "yape" | "efectivo" };

export type ParsedTx = {
  type: TxType;
  amount: number;
  currency: CurrencyCode;
  /** Solo si el correo trae su tipo de cambio (pago de tarjeta en US$). */
  fxRate?: number;
  amountPen?: number;
  occurredAt: Date;
  account: AccountRef;
  counterpart?: AccountRef;
  merchant: string | null;
  externalOpId: string | null;
  /** Nota corta con el detalle (servicio, destinatario…). */
  note?: string | null;
  /** Categoría fija del formato (Efectivo, Comisiones bancarias); si no, deciden las reglas. */
  categoryName?: string;
  /** Va a "Por revisar" aunque una regla le ponga categoría. */
  review?: boolean;
  /** Nombre para cruzar con personas (Plin, transferencias, depósitos). */
  personHint?: string | null;
};

export type ParseResult =
  | { kind: "transactions"; txs: ParsedTx[] }
  | {
      kind: "reversal";
      amount: number;
      currency: CurrencyCode;
      occurredAt: Date;
      account: AccountRef;
      merchant: string | null;
      externalOpId: string | null;
    }
  | {
      kind: "installments";
      merchant: string | null;
      originalAmount: number;
      currency: CurrencyCode;
      installmentAmount: number;
      installments: number;
      tea: number | null;
      occurredAt: Date;
      account: AccountRef;
      externalOpId: string | null;
    }
  | { kind: "ignore"; reason: string }
  | { kind: "unknown"; reason: string };

export type EmailInput = { subject: string; body: string };

type Parser = { name: string; matches: (subject: string, body: string) => boolean; parse: (body: string) => ParseResult };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const subjectHas = (needle: string) => (subject: string) => fold(subject).includes(fold(needle));
const opId = (body: string, label = "Número de operación") => field(body, label)?.match(/\d+/)?.[0] ?? null;

function fail(reason: string): ParseResult {
  return { kind: "unknown", reason };
}

/** Exige monto y fecha; si falta algo, el correo queda como desconocido (nunca se adivina). */
function need(money: Money | null, date: Date | null, what: string): { money: Money; date: Date } | ParseResult {
  if (!money) return fail(`no se encontró el monto (${what})`);
  if (!date) return fail(`no se entendió la fecha (${what})`);
  return { money, date };
}
const isResult = (v: unknown): v is ParseResult => typeof v === "object" && v !== null && "kind" in v;

function cardConsumption(card: "Crédito" | "Débito") {
  return (body: string): ParseResult => {
    const r = need(parseMoney(field(body, "Total del consumo")), parseEmailDate(field(body, "Fecha y hora")), "consumo");
    if (isResult(r)) return r;
    const last4 = last4After(body, `Número de Tarjeta de ${card}`);
    if (!last4) return fail("no se encontró el número de tarjeta");
    const merchant = cleanMerchant(field(body, "Empresa"));
    const isPlin = !!merchant && /^PLIN-/i.test(merchant);
    return {
      kind: "transactions",
      txs: [
        {
          type: "gasto",
          amount: r.money.amount,
          currency: r.money.currency,
          occurredAt: r.date,
          account: card === "Crédito" ? { last4 } : { cardLast4: last4 },
          merchant,
          externalOpId: opId(body),
          // Formato 2: un PLIN- (o un Yape a una persona) es un pago a persona: preguntar.
          ...(isPlin && { review: true, personHint: merchant!.replace(/^PLIN-/i, "").trim() }),
        },
      ],
    };
  };
}

/** Transferencias a otra persona (formatos 3 y 10): por revisar; la comisión va aparte. */
function transferToOthers(amountLabel: string) {
  return (body: string): ParseResult => {
    const r = need(parseMoney(field(body, amountLabel)), parseEmailDate(field(body, "Fecha y hora")), "transferencia");
    if (isResult(r)) return r;
    const from = last4After(body, "Desde");
    if (!from) return fail("no se encontró la cuenta de origen");
    const recipient = cleanMerchant(field(body, "Enviado a"));
    const bank = field(body, "Banco destino");
    const op = opId(body);
    const txs: ParsedTx[] = [
      {
        type: "gasto",
        amount: r.money.amount,
        currency: r.money.currency,
        occurredAt: r.date,
        account: { last4: from },
        merchant: recipient,
        externalOpId: op,
        note: bank ? `Transferencia a ${bank}` : "Transferencia a terceros BCP",
        categoryName: "Pago a persona",
        review: true, // puede ser a otra persona o a una cuenta propia en otro banco (SPEC 5)
        personHint: recipient,
      },
    ];
    const fee = parseMoney(field(body, "Comisión"));
    if (fee && fee.amount > 0) {
      txs.push({
        type: "gasto",
        amount: fee.amount,
        currency: fee.currency,
        occurredAt: r.date,
        account: { last4: from },
        merchant: "Comisión BCP",
        externalOpId: op ? `${op}-comision` : null,
        categoryName: "Comisiones bancarias",
      });
    }
    return { kind: "transactions", txs };
  };
}

const PARSERS: Parser[] = [
  // ───── no son movimientos ─────
  {
    name: "ignorar_rechazo",
    matches: subjectHas("Se rechazó tu compra"),
    parse: () => ({ kind: "ignore", reason: "compra rechazada: no hubo cobro" }),
  },
  {
    name: "ignorar_configuracion",
    matches: subjectHas("Constancia de Configuración de Tarjeta"),
    parse: () => ({ kind: "ignore", reason: "configuración de tarjeta" }),
  },

  // ───── formatos 1 y 2 ─────
  { name: "consumo_credito", matches: subjectHas("consumo con tu Tarjeta de Crédito"), parse: cardConsumption("Crédito") },
  { name: "consumo_debito", matches: subjectHas("consumo con tu Tarjeta de Débito"), parse: cardConsumption("Débito") },

  // ───── formato 3 y 10 ─────
  { name: "transferencia_otros_bancos", matches: subjectHas("Transferencia a Otros Bancos"), parse: transferToOthers("Monto enviado") },
  { name: "transferencia_terceros", matches: subjectHas("Transferencia a Terceros"), parse: transferToOthers("Monto transferido") },

  // ───── formato 4: entre mis cuentas ─────
  {
    name: "transferencia_propia",
    matches: subjectHas("Transferencia Entre mis Cuentas"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto transferido")), parseEmailDate(field(body, "Fecha y hora")), "transferencia propia");
      if (isResult(r)) return r;
      const from = last4After(body, "Desde");
      const to = last4After(body, "Enviado a");
      if (!from || !to) return fail("no se encontraron las cuentas de origen y destino");
      return {
        kind: "transactions",
        txs: [
          {
            type: "transferencia",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            account: { last4: from },
            counterpart: { last4: to },
            merchant: null,
            externalOpId: opId(body),
          },
        ],
      };
    },
  },

  // ───── formato 5: pago de tarjeta (puede ser en US$ con tipo de cambio) ─────
  {
    name: "pago_tarjeta",
    matches: subjectHas("Constancia de Pago de Tarjeta de Crédito Propia"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto pagado")), parseEmailDate(field(body, "Fecha y hora")), "pago de tarjeta");
      if (isResult(r)) return r;
      const from = last4After(body, "Desde");
      const card = last4After(body, "Pagado a");
      if (!from || !card) return fail("no se encontraron la cuenta de origen y la tarjeta");
      const tx: ParsedTx = {
        type: "pago_tarjeta",
        amount: r.money.amount,
        currency: r.money.currency,
        occurredAt: r.date,
        account: { last4: from },
        counterpart: { last4: card },
        merchant: null,
        externalOpId: opId(body),
        note: field(body, "Tipo de pago") ? `Pago ${field(body, "Tipo de pago")!.toLowerCase()}` : null,
      };
      if (r.money.currency === "USD") {
        const rate = parseRate(field(body, "Tipo de cambio"));
        const total = parseMoney(field(body, "Total cobrado al tipo de cambio"));
        if (rate) tx.fxRate = rate;
        if (total) tx.amountPen = total.amount;
      }
      return { kind: "transactions", txs: [tx] };
    },
  },

  // ───── formato 6: pago de servicio (Banca Móvil) ─────
  {
    name: "pago_servicio",
    matches: subjectHas("CONSTANCIA DE PAGO DE SERVICIO"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto total")), parseEmailDate(field(body, "Fecha y hora")), "pago de servicio");
      if (isResult(r)) return r;
      const origin = field(body, "Cuenta de origen") ?? "";
      const last4 = last4After(body, "Cuenta de origen");
      if (!last4) return fail("no se encontró la cuenta de origen");
      const company = cleanMerchant(field(body, "Empresa"));
      const service = cleanMerchant(field(body, "Servicio"));
      return {
        kind: "transactions",
        txs: [
          {
            type: "gasto",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            // Puede pagarse con la tarjeta de crédito (****6129) o con una cuenta.
            account: /tarjeta de d[eé]bito/i.test(origin) ? { cardLast4: last4 } : { last4 },
            merchant: company,
            externalOpId: opId(body) ?? body.match(/Número de operación:?\s*\*?\s*(\d+)/)?.[1] ?? null,
            note: service,
          },
        ],
      };
    },
  },

  // ───── formato 7: yapeo de servicio ─────
  {
    name: "yape_servicio",
    matches: subjectHas("Tu yapeo de servicio ha sido confirmado"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto total")), parseEmailDate(field(body, "Fecha y hora")), "yapeo de servicio");
      if (isResult(r)) return r;
      return {
        kind: "transactions",
        txs: [
          {
            type: "gasto",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            account: { kind: "yape" },
            merchant: cleanMerchant(field(body, "Empresa")),
            externalOpId: body.match(/operación Yape:?\s*\*?(\d+)/i)?.[1] ?? null,
            note: cleanMerchant(field(body, "Servicio")),
          },
        ],
      };
    },
  },

  // ───── formato 8: retiro en agente o cajero ─────
  {
    name: "retiro",
    matches: subjectHas("Realizaste un retiro"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto retirado")), parseEmailDate(field(body, "Fecha y hora")), "retiro");
      if (isResult(r)) return r;
      const account = last4After(body, "Cuenta de cargo");
      const card = last4After(body, "Número de Tarjeta de Débito");
      if (!account && !card) return fail("no se encontró la cuenta del retiro");
      const ref: AccountRef = account ? { last4: account } : { cardLast4: card! };
      const op = opId(body);
      const txs: ParsedTx[] = [
        {
          type: "retiro_efectivo",
          amount: r.money.amount,
          currency: r.money.currency,
          occurredAt: r.date,
          account: ref,
          counterpart: { kind: "efectivo" },
          merchant: field(body, "Canal") ?? "Retiro",
          externalOpId: op,
          categoryName: "Efectivo",
        },
      ];
      const fee = parseMoney(field(body, "Comisión por operación"));
      if (fee && fee.amount > 0) {
        txs.push({
          type: "gasto",
          amount: fee.amount,
          currency: fee.currency,
          occurredAt: r.date,
          account: ref,
          merchant: "Comisión BCP",
          externalOpId: op ? `${op}-comision` : null,
          categoryName: "Comisiones bancarias",
        });
      }
      return { kind: "transactions", txs };
    },
  },

  // ───── formato 9: devolución ─────
  {
    name: "devolucion",
    matches: subjectHas("Realizamos una devolución"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Total devuelto")), parseEmailDate(field(body, "Fecha y hora")), "devolución");
      if (isResult(r)) return r;
      const card = last4After(body, "Número de Tarjeta");
      if (!card) return fail("no se encontró la tarjeta de la devolución");
      return {
        kind: "reversal",
        amount: r.money.amount,
        currency: r.money.currency,
        occurredAt: r.date,
        account: { cardLast4: card },
        merchant: cleanMerchant(field(body, "Nombre del Comercio")),
        externalOpId: opId(body),
      };
    },
  },

  // ───── formato 11: pase a cuotas ─────
  {
    name: "pase_cuotas",
    matches: subjectHas("CONSTANCIA DE PASE A CUOTAS"),
    parse: (body) => {
      const original = parseMoney(field(body, "Monto original"));
      const installment = parseMoney(field(body, "Monto de cuota aprox."));
      const n = Number(field(body, "Número de cuotas")?.match(/\d+/)?.[0]);
      const date = parseEmailDate(field(body, "Fecha y hora"));
      const card = last4After(body, "cuotas de un movimiento");
      if (!original || !installment || !n || !date || !card) return fail("faltan datos del pase a cuotas");
      return {
        kind: "installments",
        merchant: cleanMerchant(field(body, "Movimiento")),
        originalAmount: original.amount,
        currency: original.currency,
        installmentAmount: installment.amount,
        installments: n,
        tea: parsePercent(field(body, "TEA (Tasa Efectiva Anual)")),
        occurredAt: date,
        account: { last4: card },
        externalOpId: opId(body),
      };
    },
  },

  // ───── formato 12: pago en Yape Promos ─────
  {
    name: "yape_promos",
    matches: (subject, body) => subjectHas("Constancia de Transferencia - Yape")(subject) && /Yape Promos/i.test(body),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto total")), parseEmailDate(field(body, "Fecha y hora")), "Yape Promos");
      if (isResult(r)) return r;
      return {
        kind: "transactions",
        txs: [
          {
            type: "gasto",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            account: { kind: "yape" },
            merchant: "Yape Promos", // el comercio llega en otro correo ("Tu compra de … fue exitosa")
            externalOpId: body.match(/operación\s+Yape:?\s*\*?(\d+)/i)?.[1] ?? null,
          },
        ],
      };
    },
  },

  // ───── formato 13: compra en Yape ("Tu compra de Norky's fue exitosa") ─────
  {
    name: "yape_compra",
    matches: (subject) => /tu compra de .+ fue exitosa/i.test(normalizeBody(subject)),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto total:")), parseEmailDate(field(body, "Fecha y hora:")), "compra Yape");
      if (isResult(r)) return r;
      return {
        kind: "transactions",
        txs: [
          {
            type: "gasto",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            account: { kind: "yape" },
            merchant: cleanMerchant(field(body, "Comercio:")),
            externalOpId: null,
          },
        ],
      };
    },
  },

  // ───── formato 14: depósito recibido en Yape ─────
  {
    name: "yape_deposito",
    matches: subjectHas("comprobante de tu depósito recibido"),
    parse: (body) => {
      const r = need(parseMoney(field(body, "Monto:")), parseEmailDate(field(body, "Fecha:")), "depósito recibido");
      if (isResult(r)) return r;
      const suffix = last4After(body, "N° de cuenta");
      const from = cleanMerchant(field(body, "De:"));
      return {
        kind: "transactions",
        txs: [
          {
            type: "ingreso",
            amount: r.money.amount,
            currency: r.money.currency,
            occurredAt: r.date,
            account: suffix ? { last4Suffix: suffix } : { kind: "yape" },
            merchant: from,
            externalOpId: field(body, "N° de operación:")?.match(/\d+/)?.[0] ?? null,
            note: field(body, "Mensajes:"),
            review: true, // puede ser un reembolso, un retiro de otra billetera o un ingreso
            personHint: from,
          },
        ],
      };
    },
  },
];

/** Elige el lector por el asunto y devuelve lo que entendió (o "unknown" con el motivo). */
export function parseEmail({ subject, body }: EmailInput): { parser: string; result: ParseResult } {
  const text = normalizeBody(body);
  const cleanSubject = normalizeBody(subject);
  const parser = PARSERS.find((p) => p.matches(cleanSubject, text));
  if (!parser) return { parser: "desconocido", result: fail("formato no reconocido") };
  try {
    return { parser: parser.name, result: parser.parse(text) };
  } catch (e) {
    return { parser: parser.name, result: fail(`error al leer: ${(e as Error).message}`) };
  }
}
