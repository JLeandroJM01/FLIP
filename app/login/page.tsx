import type { Metadata } from "next";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Entrar · FLIP" };

const ERRORS: Record<string, string> = {
  no_permitido: "Esta cuenta de Google no tiene acceso a FLIP.",
  sesion: "No se pudo iniciar sesión. Inténtalo de nuevo.",
  sin_codigo: "Google no devolvió la sesión. Inténtalo de nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(62,207,142,0.18),transparent_60%)]"
      />
      <div className="relative w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-5xl font-semibold tracking-tight text-primary">FLIP</p>
          <p className="text-muted-foreground">Finanzas y Liderazgo Inteligente con un Propósito</p>
        </div>
        <div className="space-y-4 rounded-2xl border bg-card/80 p-6 backdrop-blur">
          <GoogleButton />
          {message && (
            <p role="alert" className="text-center text-sm text-destructive">
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
