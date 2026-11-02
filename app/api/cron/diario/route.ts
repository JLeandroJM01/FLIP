import { NextResponse, type NextRequest } from "next/server";
import { limaDateKey } from "@/lib/dates";
import { processPendingEmails } from "@/lib/ingest/process";
import { purgeOldEmailBodies, registerSalaryPayments } from "@/lib/ingest/recurring";
import { createAdminClient } from "@/lib/supabase/admin";

// Tarea diaria (Vercel Cron, ver vercel.json). Vercel manda "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const today = limaDateKey(new Date());
  const [salary, emails, purge] = [
    await registerSalaryPayments(db, today),
    await processPendingEmails(db), // reintenta los correos con error (p. ej. sin tipo de cambio)
    await purgeOldEmailBodies(db),
  ];
  return NextResponse.json({ ok: true, today, salary, emails, purge });
}
