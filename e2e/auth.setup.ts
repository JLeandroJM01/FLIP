import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { test as setup } from "@playwright/test";
import { AUTH_FILE } from "../playwright.config";
import { adminClient } from "./helpers";

// Crea una sesión del usuario permitido en el Supabase LOCAL sin pasar por Google:
// le pone una contraseña aleatoria (solo local) y guarda las cookies de @supabase/ssr.
setup("sesión del usuario permitido", async () => {
  const admin = adminClient();
  const email = process.env.ALLOWED_EMAIL!.toLowerCase();
  const password = randomBytes(24).toString("hex");

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
  }
  await admin.from("allowed_emails").upsert({ email });

  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((j) => j.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(
    AUTH_FILE,
    JSON.stringify({
      cookies: jar.map((c) => ({
        ...c,
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      })),
      origins: [],
    }),
  );
});
