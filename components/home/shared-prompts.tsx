"use client";

import { Users } from "lucide-react";
import { useTransition } from "react";
import { dismissSharedPrompt } from "@/app/(app)/actions";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { Button } from "@/components/ui/button";
import { formatPEN } from "@/lib/format";
import type { TransactionRow } from "@/lib/types";

/** SPEC 8: "S/ 180 en [comercio]. ¿Fue compartido?" → Sí / No. */
export function SharedPrompts({ transactions }: { transactions: TransactionRow[] }) {
  const { openShared } = useQuickAdd();
  const [pending, startTransition] = useTransition();
  if (transactions.length === 0) return null;
  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <div key={tx.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3">
          <Users className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-sm">
            <strong className="tabular">{formatPEN(Number(tx.amount_pen))}</strong> en {tx.merchant || tx.note || tx.category?.name}. ¿Fue compartido?
          </p>
          <div className="flex gap-2">
            <Button size="touch" onClick={() => openShared(tx)}>
              Sí
            </Button>
            <Button size="touch" variant="ghost" disabled={pending} onClick={() => startTransition(() => dismissSharedPrompt(tx.id).then(() => undefined))}>
              No
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
