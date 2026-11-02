import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
// Llamadas de máquina a máquina: se autentican con su propia firma, no con sesión.
const MACHINE_PATHS = ["/api/ingest", "/api/cron/diario"];

/** Refresca la sesión en cada request y protege todas las rutas salvo el login. */
export async function updateSession(request: NextRequest) {
  if (MACHINE_PATHS.includes(request.nextUrl.pathname)) return NextResponse.next();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // No poner código entre createServerClient y getClaims (refresca el token).
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = new URLSearchParams(params).toString();
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (data?.claims && (!allowed || email !== allowed)) {
    await supabase.auth.signOut();
    return redirectTo("/login", { error: "no_permitido" });
  }
  if (!data?.claims && !isPublic) return redirectTo("/login");
  if (data?.claims && pathname === "/login") return redirectTo("/");

  return response;
}
