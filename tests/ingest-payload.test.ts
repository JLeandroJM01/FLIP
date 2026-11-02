import { describe, expect, it } from "vitest";
import { ingestPayloadSchema, isFresh, isValidSignature, signBody } from "@/lib/ingest/payload";

const SECRET = "secreto-de-prueba";
const body = JSON.stringify({ sent_at: "2026-11-02T19:00:00.000Z", messages: [] });

describe("firma HMAC", () => {
  it("acepta la firma correcta (hex en minúsculas o mayúsculas)", () => {
    const sig = signBody(body, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(isValidSignature(body, sig, SECRET)).toBe(true);
    expect(isValidSignature(body, sig.toUpperCase(), SECRET)).toBe(true);
  });

  it("rechaza firma ausente, inválida, de otro secreto o de otro body", () => {
    const sig = signBody(body, SECRET);
    expect(isValidSignature(body, null, SECRET)).toBe(false);
    expect(isValidSignature(body, "abc", SECRET)).toBe(false);
    expect(isValidSignature(body, signBody(body, "otro"), SECRET)).toBe(false);
    expect(isValidSignature(body + " ", sig, SECRET)).toBe(false);
  });

  it("firma igual que el Apps Script con tildes (UTF-8)", () => {
    // Valor calculado con Utilities.computeHmacSha256Signature(body, key, UTF_8) → hex
    const b = '{"subject":"Constancia de Transferencia Entre mis Cuentas — operación"}';
    expect(signBody(b, SECRET)).toBe(signBody(Buffer.from(b, "utf8").toString("utf8"), SECRET));
  });
});

describe("payload", () => {
  it("valida la forma que manda el Apps Script", () => {
    const ok = ingestPayloadSchema.safeParse({
      sent_at: "2026-11-02T19:00:00.000Z",
      messages: [
        {
          gmail_message_id: "18f2a",
          from: "BCP Notificaciones <notificaciones@notificacionesbcp.com.pe>",
          subject: "Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP",
          date: "2026-11-02T14:43:00.000Z",
          plain_body: "Hola Jose Leandro, ...",
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rechaza peticiones de hace más de 15 minutos", () => {
    const now = Date.parse("2026-11-02T19:00:00.000Z");
    expect(isFresh("2026-11-02T18:50:00.000Z", now)).toBe(true);
    expect(isFresh("2026-11-02T18:40:00.000Z", now)).toBe(false);
  });
});
