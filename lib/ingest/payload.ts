// Contrato entre el Apps Script de Gmail y POST /api/ingest (SPEC 3.1 y 3.2).
// Firma: X-Ingest-Signature = HMAC-SHA256(body crudo, INGEST_SECRET) en hex.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
export const MAX_MESSAGES_PER_REQUEST = 50;

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Compara la firma en tiempo constante. */
export function isValidSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signBody(body, secret), "hex");
  return timingSafeEqual(expected, Buffer.from(signature.toLowerCase(), "hex"));
}

export const ingestPayloadSchema = z.object({
  /** Momento del envío (ISO). Evita que se reutilice una petición vieja. */
  sent_at: z.iso.datetime({ offset: true }),
  messages: z
    .array(
      z.object({
        gmail_message_id: z.string().min(1).max(200),
        from: z.string().max(500),
        subject: z.string().max(1000),
        date: z.iso.datetime({ offset: true }),
        plain_body: z.string().max(200_000),
      }),
    )
    .max(MAX_MESSAGES_PER_REQUEST),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export function isFresh(sentAt: string, now = Date.now()): boolean {
  return Math.abs(now - Date.parse(sentAt)) <= MAX_CLOCK_SKEW_MS;
}
