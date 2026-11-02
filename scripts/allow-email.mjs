// Agrega ALLOWED_EMAIL a public.allowed_emails (la lista que usa RLS).
// Usa el service role: solo se corre desde tu máquina, nunca desde el navegador.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ALLOWED_EMAIL?.trim().toLowerCase();

if (!url || !serviceKey || !email) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o ALLOWED_EMAIL.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await supabase.from("allowed_emails").upsert({ email });
if (error) {
  console.error("No se pudo guardar el correo permitido:", error.message);
  process.exit(1);
}
console.log(`Correo permitido en ${new URL(url).host}: ${email}`);
