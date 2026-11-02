// Un test por formato (SPEC 5) con los fixtures de tests/fixtures/emails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEmail, type ParsedTx, type ParseResult } from "@/lib/parsers";

function fixture(name: string) {
  const raw = readFileSync(`tests/fixtures/emails/${name}.txt`, "utf8");
  const [first, ...rest] = raw.split("\n");
  return { subject: first.replace(/^Subject: /, ""), body: rest.join("\n") };
}
const lima = (iso: string) => new Date(`${iso}:00-05:00`);
function txs(name: string): { parser: string; txs: ParsedTx[] } {
  const { parser, result } = parseEmail(fixture(name));
  if (result.kind !== "transactions") throw new Error(`${name}: ${JSON.stringify(result)}`);
  return { parser, txs: result.txs };
}
function only(name: string) {
  const r = txs(name);
  expect(r.txs).toHaveLength(1);
  return { parser: r.parser, tx: r.txs[0] };
}

describe("formato 1: consumo con tarjeta de crédito", () => {
  it("en soles", () => {
    const { parser, tx } = only("consumo_credito");
    expect(parser).toBe("consumo_credito");
    expect(tx).toMatchObject({
      type: "gasto", amount: 70, currency: "PEN", account: { last4: "6129" },
      merchant: "AQUA HOTEL 933", externalOpId: "0000161072", occurredAt: lima("2026-10-31T20:17"),
    });
  });
  it("en dólares (APPLE.COM/BILL)", () => {
    expect(only("consumo_credito_usd").tx).toMatchObject({ amount: 3.84, currency: "USD", merchant: "APPLE.COM/BILL" });
  });
});

describe("formato 2: consumo con débito", () => {
  it("un PLIN- es pago a persona y va a revisar", () => {
    expect(only("consumo_debito_plin").tx).toMatchObject({
      type: "gasto", amount: 26, account: { cardLast4: "4039" }, merchant: "PLIN-JUAN PEREZ GO",
      review: true, personHint: "JUAN PEREZ GO", externalOpId: "051466", occurredAt: lima("2026-11-01T04:59"),
    });
  });
});

describe("formatos 3 y 10: transferencias a otras personas", () => {
  it("a otro banco: por revisar, desde la cuenta ****2046", () => {
    expect(only("transferencia_otros_bancos").tx).toMatchObject({
      type: "gasto", amount: 300, account: { last4: "2046" }, merchant: "Maria Perez Q",
      review: true, categoryName: "Pago a persona", note: "Transferencia a Interbank", externalOpId: "04127458",
      occurredAt: lima("2026-10-30T15:13"),
    });
  });
  it("una comisión mayor a 0 se registra aparte", () => {
    const f = fixture("transferencia_otros_bancos");
    const body = f.body.replace("Comisión *S/ 0.00*", "Comisión *S/ 3.50*");
    const r = parseEmail({ ...f, body }).result as Extract<ParseResult, { kind: "transactions" }>;
    expect(r.txs[1]).toMatchObject({ amount: 3.5, categoryName: "Comisiones bancarias" });
  });
  it("a terceros BCP: sugiere a la persona por el nombre", () => {
    expect(only("transferencia_terceros").tx).toMatchObject({
      amount: 2000, account: { last4: "2046" }, review: true, personHint: "Gomez Rojas Walter E",
    });
  });
});

describe("formato 4: entre mis cuentas", () => {
  it("es transferencia interna de ****2046 a ****6060 (no es gasto)", () => {
    expect(only("transferencia_propia").tx).toMatchObject({
      type: "transferencia", amount: 600, account: { last4: "2046" }, counterpart: { last4: "6060" },
    });
  });
});

describe("formato 5: pago de tarjeta", () => {
  it("en soles, de la cuenta sueldo a la Visa", () => {
    expect(only("pago_tarjeta").tx).toMatchObject({
      type: "pago_tarjeta", amount: 300, currency: "PEN", account: { last4: "2046" }, counterpart: { last4: "6129" },
      externalOpId: "08995569", occurredAt: lima("2026-10-31T23:38"), note: "Pago otro",
    });
  });
  it("en dólares guarda el tipo de cambio y el total en soles", () => {
    const f = fixture("pago_tarjeta");
    const body = f.body
      .replace("Monto pagado *S/ 300.00*", "Monto pagado *$ 188.41* \nTipo de cambio *S/ 3.4990* \nTotal cobrado al tipo de cambio *S/ 659.25*");
    const r = parseEmail({ ...f, body }).result as Extract<ParseResult, { kind: "transactions" }>;
    expect(r.txs[0]).toMatchObject({ amount: 188.41, currency: "USD", fxRate: 3.499, amountPen: 659.25 });
  });
});

describe("formato 6: pago de servicio", () => {
  it("CLARO pagado con la tarjeta de crédito", () => {
    expect(only("pago_servicio").tx).toMatchObject({
      type: "gasto", amount: 39.95, account: { last4: "6129" }, merchant: "CLARO", note: "02 PAGO POR TELEFONO",
      externalOpId: "00766331", occurredAt: lima("2026-10-26T08:22"),
    });
  });
});

describe("formato 7: yapeo de servicio", () => {
  it("Metropolitano desde la cuenta de Yape", () => {
    expect(only("yape_servicio").tx).toMatchObject({
      type: "gasto", amount: 5, account: { kind: "yape" }, merchant: "Metropolitano y Corredores",
      note: "Recarga de Tarjetas", externalOpId: "01593410", occurredAt: lima("2026-11-02T13:58"),
    });
  });
});

describe("formato 8: retiro", () => {
  it("es retiro de efectivo desde ****6060 hacia Efectivo; GRATIS = sin comisión", () => {
    const r = txs("retiro_agente");
    expect(r.txs).toHaveLength(1);
    expect(r.txs[0]).toMatchObject({
      type: "retiro_efectivo", amount: 200, account: { last4: "6060" }, counterpart: { kind: "efectivo" },
      categoryName: "Efectivo", occurredAt: lima("2026-10-27T19:40"),
    });
  });
});

describe("formato 9: devolución", () => {
  it("devuelve monto, tarjeta y comercio para buscar el original", () => {
    expect(parseEmail(fixture("devolucion")).result).toMatchObject({
      kind: "reversal", amount: 500, account: { cardLast4: "4039" }, merchant: "PLIN-LUIS TORRES", externalOpId: "989474",
    });
  });
});

describe("formato 11: pase a cuotas", () => {
  it("crea una deuda en cuotas (no es gasto nuevo)", () => {
    const r = parseEmail(fixture("pase_cuotas")).result;
    expect(r).toMatchObject({
      kind: "installments", merchant: "MUSIC ENTERTAINMENT EI LIMA PE", originalAmount: 1060, currency: "PEN",
      installmentAmount: 408.23, installments: 3, account: { last4: "6129" }, externalOpId: "0000000000000010179208",
    });
    expect((r as { tea: number }).tea).toBeCloseTo(0.9189, 6);
  });
  it("también en dólares", () => {
    expect(parseEmail(fixture("pase_cuotas_usd")).result).toMatchObject({ kind: "installments", originalAmount: 299.5, currency: "USD" });
  });
});

describe("Yape: promos, compras y depósitos", () => {
  it("formato 12: Yape Promos es gasto en la cuenta de Yape", () => {
    expect(only("yape_promos").tx).toMatchObject({
      type: "gasto", amount: 17.9, account: { kind: "yape" }, merchant: "Yape Promos", externalOpId: "2252450",
      occurredAt: lima("2026-11-01T20:15"),
    });
  });
  it("formato 13: la compra trae el comercio (mismo monto y hora que Yape Promos)", () => {
    expect(only("yape_compra").tx).toMatchObject({
      type: "gasto", amount: 17.9, account: { kind: "yape" }, merchant: "Norky's", occurredAt: lima("2026-11-01T20:15"),
    });
  });
  it("formato 14: depósito recibido es ingreso por revisar a la cuenta ****060", () => {
    expect(only("yape_deposito").tx).toMatchObject({
      type: "ingreso", amount: 50, account: { last4Suffix: "060" }, merchant: "Betsafe", review: true,
      externalOpId: "14930843", note: "Retiro al instante", occurredAt: lima("2026-11-01T21:55"),
    });
  });
});

describe("correos que no son movimientos y desconocidos", () => {
  it("una compra rechazada no se cuenta", () => {
    expect(parseEmail(fixture("rechazo")).result.kind).toBe("ignore");
  });
  it("la configuración de tarjeta no se cuenta", () => {
    expect(parseEmail(fixture("configuracion")).result.kind).toBe("ignore");
  });
  it("un asunto desconocido no se adivina", () => {
    expect(parseEmail({ subject: "Tu estado de cuenta", body: "S/ 100.00" })).toMatchObject({
      parser: "desconocido", result: { kind: "unknown" },
    });
  });
  it("si falta la fecha, no se adivina", () => {
    const f = fixture("consumo_credito");
    const r = parseEmail({ ...f, body: f.body.replace(/Fecha y hora \*[^*]+\*/, "") }).result;
    expect(r).toMatchObject({ kind: "unknown", reason: expect.stringContaining("fecha") });
  });
});

describe("formatos encontrados en el backfill (texto real, anonimizado)", () => {
  const parse = (subject: string, body: string) => parseEmail({ subject, body });
  it("retiro en cajero: 'Total retirado', cuenta enmascarada → por la tarjeta", () => {
    const r = parse(
      "Realizaste un retiro en un cajero automático BCP - Servicio de Notificaciones BCP",
      "*Montos*\nTotal retirado *S/ 170.00* \nComisión por operación  *GRATIS* \nFecha y hora *19 de setiembre de 2026 - 06:45 PM* \nNúmero de Tarjeta de Débito *************4039* \nCuenta de cargo *XXX-XXXXXXXX-0-60* \nNúmero de operación *4105* ",
    ).result as Extract<ParseResult, { kind: "transactions" }>;
    expect(r.txs).toHaveLength(1);
    expect(r.txs[0]).toMatchObject({ type: "retiro_efectivo", amount: 170, account: { cardLast4: "4039" } });
  });
  it("Yape Promos con 'sept.'", () => {
    const r = parse("Envío Automático - Constancia de Transferencia - Yape", "¡Tu pago en Yape Promos fue exitoso!\nMonto total\nS/ 27.80\nFecha y hora: 29 sept. 2026 - 07:21 p. m.\nNúmero de\noperación Yape: 1423261");
    expect(r.result).toMatchObject({ kind: "transactions", txs: [{ amount: 27.8, occurredAt: new Date("2026-09-29T19:21:00-05:00") }] });
  });
  it("pago con QR (yapeo a celular desde la app BCP) = pago a persona por revisar", () => {
    const r = parse(
      "Constancia de Pago con QR - Servicios de Notificaciones BCP",
      "Monto enviado *S/ 20.00* \nFecha y hora *04 de septiembre de 2026 - 08:55 PM* \nEnviado a *Pedro Perez C.*\nDestino *Yape* \nDesde *Cuenta de ahorro*\n**** 2046 \nNúmero de operación *05055670* ",
    ).result as Extract<ParseResult, { kind: "transactions" }>;
    expect(r.txs[0]).toMatchObject({ type: "gasto", amount: 20, account: { last4: "2046" }, review: true, personHint: "Pedro Perez C" });
  });
  it("adelanto de sueldo entra como Sueldo (el próximo sueldo llega reducido)", () => {
    const r = parse(
      "Constancia de Adelanto de Sueldo - Servicio de Notificaciones BCP",
      "Monto de adelanto *S/ 910.00* \nComisión *S/ 35.00* \n*Total a cobrar* *S/ 945.00* \nFecha y hora *2 de septiembre de 2026 - 12:52 PM* \nDesde *Cuenta Sueldo*\n**** 2046 \nNúmero de operación *02349798* ",
    ).result as Extract<ParseResult, { kind: "transactions" }>;
    expect(r.txs[0]).toMatchObject({ type: "ingreso", amount: 910, account: { last4: "2046" }, categoryName: "Sueldo" });
    expect(r.txs[0].note).toContain("S/ 945.00");
  });
  it.each([
    "Constancia de envío de Estado de Cuenta - Servicio de Notificaciones BCP",
    "Tu crédito ya está disponible en tu cuenta Yape",
    "Tu fecha de pago está cerca",
  ])("se ignora: %s", (subject) => expect(parse(subject, "S/ 1.00").result.kind).toBe("ignore"));
});
