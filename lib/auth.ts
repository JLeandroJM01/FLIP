import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Solo el correo de ALLOWED_EMAIL puede entrar (además, RLS lo exige en la base). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  return !!allowed && email?.trim().toLowerCase() === allowed;
}

/** Para páginas y acciones: devuelve el cliente y el usuario, o manda al login. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  if (!data?.claims || !isAllowedEmail(email)) redirect("/login");
  return { supabase, email: email! };
}
