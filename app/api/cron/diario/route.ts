import { NextResponse, type NextRequest } from "next/server";
import { limaDateKey } from "@/lib/dates";
import { processPendingEmails } from "@/lib/ingest/process";
import { purgeOldEmailBodies, registerAutoDebits, registerIncomeEvents, registerSalaryPayments } from "@/lib/ingest/recurring";
import { createAdminClient } from "@/lib/supabase/admin";

// Tarea diaria (Vercel Cron, ver vercel.json). Vercel manda "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const today = limaDateKey(new Date());
  const result = {
    salary: await registerSalaryPayments(db, today),
    incomeEvents: await registerIncomeEvents(db, today), // gratificación, CTS, utilidades
    autoDebits: await registerAutoDebits(db, today), // cuota del crédito Yape (día 28)
    emails: await processPendingEmails(db), // reintenta los correos con error (p. ej. sin tipo de cambio)
    purge: await purgeOldEmailBodies(db),
  };
  return NextResponse.json({ ok: true, today, ...result });
}
