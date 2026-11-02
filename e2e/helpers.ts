import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.SUPABASE_URL!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url ?? "")) {
    throw new Error(`Los tests e2e solo corren contra el Supabase local (SUPABASE_URL=${url})`);
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Marca de los datos que crean los tests (se borran al final). */
export const E2E_MARK = "e2e";

export async function cleanupE2EData() {
  await adminClient().from("transactions").delete().like("note", `${E2E_MARK}%`);
}
