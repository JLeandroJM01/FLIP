"use client";

import { Banknote, HandCoins, Plus } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { Button } from "@/components/ui/button";

/** Botones rápidos del Inicio (SPEC 13): + Gasto efectivo · Me yapearon · + Ingreso. */
export function QuickActions({ cashAccountId }: { cashAccountId?: string }) {
  const { openQuickAdd } = useQuickAdd();
  return (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
      <Button size="touch" className="h-auto min-h-11 flex-col gap-1 py-2 text-sm sm:flex-row sm:py-0 sm:text-base" onClick={() => openQuickAdd("gasto", { accountId: cashAccountId })}>
        <Banknote /> Gasto efectivo
      </Button>
      <Button size="touch" variant="secondary" className="h-auto min-h-11 flex-col gap-1 py-2 text-sm sm:flex-row sm:py-0 sm:text-base" onClick={() => openQuickAdd("reembolso")}>
        <HandCoins /> Me yapearon
      </Button>
      <Button size="touch" variant="secondary" className="h-auto min-h-11 flex-col gap-1 py-2 text-sm sm:flex-row sm:py-0 sm:text-base" onClick={() => openQuickAdd("ingreso")}>
        <Plus /> Ingreso
      </Button>
    </div>
  );
}
