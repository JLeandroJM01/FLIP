// POST /api/ingest contra el Supabase local (npm run test:db).
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/route";
import { signBody } from "@/lib/ingest/payload";

const SECRET = process.env.INGEST_SECRET!;
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const ID = `test-ingest-${Date.now()}`;

function request(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-ingest-signature": signature ?? signBody(body, SECRET) },
  });
}

const message = {
  gmail_message_id: ID,
  from: "BCP Notificaciones <notificaciones@notificacionesbcp.com.pe>",
  subject: "Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP",
  date: "2026-11-02T14:43:00.000Z",
  plain_body: "Realizaste un consumo de S/ 16.50 con tu Tarjeta de Crédito BCP en DELICASS.",
};
const payload = () => ({ sent_at: new Date().toISOString(), messages: [message] });

afterAll(async () => {
  await admin.from("raw_emails").delete().like("gmail_message_id", "test-ingest-%");
});

describe("POST /api/ingest", () => {
  it("rechaza una firma inválida", async () => {
    const res = await POST(request(payload(), "0".repeat(64)));
    expect(res.status).toBe(401);
  });

  it("rechaza una petición vieja aunque esté firmada", async () => {
    const res = await POST(request({ sent_at: "2026-01-01T00:00:00.000Z", messages: [message] }));
    expect(res.status).toBe(401);
  });

  it("guarda el correo como pendiente", async () => {
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, received: 1, stored: 1 });
    const { data } = await admin.from("raw_emails").select("subject, body, parse_status").eq("gmail_message_id", ID).single();
    expect(data).toMatchObject({ parse_status: "pendiente", subject: message.subject, body: message.plain_body });
  });

  it("si el mismo correo llega dos veces, no se duplica", async () => {
    const res = await POST(request(payload()));
    expect(await res.json()).toMatchObject({ ok: true, received: 1, stored: 0 });
    const { count } = await admin.from("raw_emails").select("id", { count: "exact", head: true }).eq("gmail_message_id", ID);
    expect(count).toBe(1);
  });

  it("una petición vacía (probarConexion) responde OK", async () => {
    const res = await POST(request({ sent_at: new Date().toISOString(), messages: [] }));
    expect(res.status).toBe(200);
  });
});
