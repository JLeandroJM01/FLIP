"use client";

import { HandCoins } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { limaDateKey } from "@/lib/dates";
import { daysBetween } from "@/lib/finance";
import { formatPEN } from "@/lib/format";
import type { OwedItem } from "@/lib/types";

/** SPEC 8: "Te deben S/ X" con la lista de personas y días desde el gasto. Tocar = "Me yapearon". */
export function OwedCard({ owed, today }: { owed: OwedItem[]; today: string }) {
  const { openQuickAdd } = useQuickAdd();
  const byPerson = new Map<string, { name: string; total: number; oldest: string }>();
  for (const o of owed) {
    const cur = byPerson.get(o.personId) ?? { name: o.personName, total: 0, oldest: o.occurredAt };
    cur.total += o.pending;
    if (o.occurredAt < cur.oldest) cur.oldest = o.occurredAt;
    byPerson.set(o.personId, cur);
  }
  const total = owed.reduce((s, o) => s + o.pending, 0);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Te deben</CardDescription>
        <CardTitle className="tabular text-3xl">{formatPEN(total)}</CardTitle>
      </CardHeader>
      <CardContent>
        {byPerson.size === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie te debe. Cuando pagues algo en grupo, márcalo como compartido.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {[...byPerson.entries()].map(([personId, p]) => {
              const days = Math.max(0, daysBetween(limaDateKey(new Date(p.oldest)), today));
              return (
                <li key={personId}>
                  <button
                    type="button"
                    onClick={() => openQuickAdd("reembolso", { personId })}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-muted/50"
                  >
                    <HandCoins className="size-4 text-primary" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{days === 0 ? "hoy" : `hace ${days} ${days === 1 ? "día" : "días"}`}</span>
                    <span className="tabular font-medium">{formatPEN(p.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
