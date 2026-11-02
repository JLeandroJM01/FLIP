import { NextResponse, type NextRequest } from "next/server";
import { ingestPayloadSchema, isFresh, isValidSignature } from "@/lib/ingest/payload";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/ingest — recibe correos del Apps Script de Gmail (SPEC 3.2).
// Fase 2, etapa 1: verifica la firma y guarda cada correo una sola vez en raw_emails
// (parse_status = pendiente). Los parsers los procesan después.
export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "INGEST_SECRET no configurado" }, { status: 500 });

  const body = await request.text();
  if (!isValidSignature(body, request.headers.get("x-ingest-signature"), secret)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ingestPayloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  if (!isFresh(parsed.data.sent_at)) return NextResponse.json({ error: "petición vencida" }, { status: 401 });

  const { messages } = parsed.data;
  if (messages.length === 0) return NextResponse.json({ ok: true, received: 0, stored: 0 });

  const supabase = createAdminClient();
  // Idempotente: si un correo llega dos veces, se queda el primero (SPEC 3.2).
  const { data, error } = await supabase
    .from("raw_emails")
    .upsert(
      messages.map((m) => ({
        gmail_message_id: m.gmail_message_id,
        from_address: m.from,
        subject: m.subject,
        received_at: m.date,
        body: m.plain_body,
        parse_status: "pendiente" as const,
      })),
      { onConflict: "gmail_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return NextResponse.json({ error: "no se pudo guardar" }, { status: 500 });

  return NextResponse.json({ ok: true, received: messages.length, stored: data?.length ?? 0 });
}
