import { ChevronRight, LogOut, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { UPCOMING } from "@/components/shell/nav-items";

export const metadata: Metadata = { title: "Más · FLIP" };

export default function MorePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Más</h1>
      </header>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        <li>
          <Link href="/ajustes" className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted/50">
            <Settings className="size-5 text-primary" />
            <span className="flex-1">Ajustes</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      </ul>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">Próximamente</h2>
        <ul className="divide-y overflow-hidden rounded-xl border border-dashed">
          {UPCOMING.map((item) => (
            <li key={item.label} className="flex min-h-12 items-center px-4 text-sm text-muted-foreground">
              <span className="flex-1">{item.label}</span>
              <span className="text-xs">{item.phase}</span>
            </li>
          ))}
        </ul>
      </section>

      <form action="/auth/signout" method="post">
        <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 text-sm text-destructive">
          <LogOut className="size-5" /> Cerrar sesión
        </button>
      </form>
    </div>
  );
}
