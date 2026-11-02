import type { Metadata } from "next";
import { GoalsView, type DepaParams } from "@/components/goals/goals-view";
import { requireUser } from "@/lib/auth";
import { getCatalogs, getSettings } from "@/lib/data";
import { limaDateKey } from "@/lib/dates";
import { loadProjectionContext } from "@/lib/projection-data";

export const metadata: Metadata = { title: "Metas · FLIP" };

export default async function GoalsPage() {
  const { supabase } = await requireUser();
  const catalogs = await getCatalogs(supabase);
  const [ctx, settings] = await Promise.all([loadProjectionContext(supabase, catalogs, limaDateKey(new Date())), getSettings(supabase)]);
  const depa = settings.depa as DepaParams;
  const living = Number(((settings.projection ?? {}) as { living?: number }).living ?? 1500);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Depa de {new Intl.NumberFormat("es-PE").format(depa.price)} · inicial {Math.round(depa.down_pct * 100)}% · crédito a {depa.years} años, TEA {Math.round(depa.tea * 100)}%
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Metas y proyección</h1>
      </header>
      {ctx ? <GoalsView ctx={ctx} depa={depa} defaultLiving={living} /> : <p className="text-muted-foreground">Falta el perfil de ingresos.</p>}
    </div>
  );
}
