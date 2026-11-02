"use client";

import { ArrowLeftRight, CircleHelp, HandCoins } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { Badge } from "@/components/ui/badge";
import { limaDateKey } from "@/lib/dates";
import { formatDayHeading, formatShortDate, formatTime } from "@/lib/format";
import type { TransactionRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describe, TYPE_LABELS } from "./labels";
import { TxAmount } from "./tx-amount";

/**
 * Celular y tablet: tarjetas agrupadas por día. Computadora (lg): tabla completa.
 * Tocar un movimiento abre la edición.
 */
export function TransactionList({
  transactions,
  grouped = true,
  compact = false,
}: {
  transactions: TransactionRow[];
  grouped?: boolean;
  /** Solo tarjetas (para el Inicio), sin tabla en computadora. */
  compact?: boolean;
}) {
  const { openEdit } = useQuickAdd();
  if (transactions.length === 0) return null;

  const groups = grouped ? groupByDay(transactions) : [{ day: null, items: transactions }];

  return (
    <>
      <div className={cn("space-y-5", !compact && "lg:hidden")}>
        {groups.map(({ day, items }) => (
          <section key={day ?? "all"} className="space-y-1">
            {day && (
              <h3 className="px-1 text-xs font-medium text-muted-foreground first-letter:uppercase">
                {formatDayHeading(items[0].occurred_at)}
              </h3>
            )}
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {items.map((tx) => (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(tx)}
                    className={cn(
                      "flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                      tx.status === "anulado" && "opacity-60",
                    )}
                  >
                    <TxIcon tx={tx} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{describe(tx)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {grouped ? formatTime(tx.occurred_at) : formatShortDate(tx.occurred_at)} ·{" "}
                        {tx.account?.name}
                        {tx.status !== "confirmado" && <StatusText status={tx.status} />}
                        {tx.status === "confirmado" && !tx.category && ["gasto", "ingreso"].includes(tx.type) && (
                          <span className="ml-1 font-medium text-amber-400">· Sin categoría</span>
                        )}
                      </span>
                    </span>
                    <TxAmount tx={tx} className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!compact && (
        <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Cuenta</th>
                <th className="px-4 py-3 font-medium">Etiquetas</th>
                <th className="px-4 py-3 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => openEdit(tx)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/50", tx.status === "anulado" && "opacity-60")}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatShortDate(tx.occurred_at)} · {formatTime(tx.occurred_at)}
                  </td>
                  <td className="max-w-72 px-4 py-3">
                    <button
                      type="button"
                      className="block max-w-full truncate text-left font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(tx);
                      }}
                    >
                      {describe(tx)}
                    </button>
                    {tx.status !== "confirmado" && <StatusText status={tx.status} />}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <TxIcon tx={tx} size="sm" />
                      <span className="truncate">{tx.category?.name ?? TYPE_LABELS[tx.type]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{tx.account?.name}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {tx.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          #{t}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TxAmount tx={tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TxIcon({ tx, size = "md" }: { tx: TransactionRow; size?: "sm" | "md" }) {
  if (tx.category) return <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={size} />;
  const uncategorized = tx.type === "gasto" || tx.type === "ingreso";
  const Icon = tx.type === "reembolso" ? HandCoins : uncategorized ? CircleHelp : ArrowLeftRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        uncategorized ? "bg-amber-400/15 text-amber-400" : "bg-accent text-primary",
        size === "md" ? "size-10" : "size-8",
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} aria-hidden />
    </span>
  );
}

function StatusText({ status }: { status: TransactionRow["status"] }) {
  return (
    <span className={cn("ml-1 font-medium", status === "por_revisar" ? "text-amber-400" : "text-muted-foreground")}>
      · {status === "por_revisar" ? "Por revisar" : "Anulado"}
    </span>
  );
}

function groupByDay(transactions: TransactionRow[]) {
  const groups: { day: string; items: TransactionRow[] }[] = [];
  for (const tx of transactions) {
    const day = limaDateKey(new Date(tx.occurred_at));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(tx);
    else groups.push({ day, items: [tx] });
  }
  return groups;
}
