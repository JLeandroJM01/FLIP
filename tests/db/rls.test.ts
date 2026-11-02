// RLS contra el Supabase local (npm run db:start && npm run test:db).
// Comprueba que solo un correo de allowed_emails ve y escribe datos.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url ?? "")) {
  throw new Error(`test:db solo corre contra el Supabase local (SUPABASE_URL=${url})`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const ALLOWED = "rls-permitido@flip.test";
const INTRUDER = "rls-intruso@flip.test";
const PASSWORD = "rls-test-password-123";
const userIds: string[] = [];

async function signedInClient(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return client;
}

let allowed: SupabaseClient;
let intruder: SupabaseClient;
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

beforeAll(async () => {
  await admin.from("allowed_emails").upsert({ email: ALLOWED });
  allowed = await signedInClient(ALLOWED);
  intruder = await signedInClient(INTRUDER);
});

afterAll(async () => {
  await admin.from("people").delete().like("name", "RLS test%");
  await admin.from("allowed_emails").delete().eq("email", ALLOWED);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

describe("RLS", () => {
  it("el usuario permitido ve los datos iniciales", async () => {
    const { data, error } = await allowed.from("accounts").select("name");
    expect(error).toBeNull();
    expect(data).toHaveLength(8);
  });

  it("el usuario permitido puede escribir", async () => {
    const { error } = await allowed.from("people").insert({ name: "RLS test permitido" });
    expect(error).toBeNull();
  });

  it("otro usuario con sesión no ve nada", async () => {
    for (const table of ["accounts", "transactions", "debts", "settings", "income_profile"]) {
      const { data, error } = await intruder.from(table).select("*");
      expect(error).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("otro usuario con sesión no puede escribir", async () => {
    const { error } = await intruder.from("people").insert({ name: "RLS test intruso" });
    expect(error?.code).toBe("42501");
  });

  it("sin sesión (anon) no hay acceso", async () => {
    const { data, error } = await anon.from("accounts").select("*");
    expect(error?.code ?? "sin error").toBe("42501");
    expect(data).toBeNull();
  });

  it("nadie lee la lista de correos permitidos desde la app", async () => {
    const { data } = await allowed.from("allowed_emails").select("*");
    expect(data ?? []).toEqual([]);
  });
});
