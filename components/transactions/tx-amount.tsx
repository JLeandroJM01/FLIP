import { formatMoney, formatPEN } from "@/lib/format";
import type { TransactionRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { direction } from "./labels";

export function TxAmount({ tx, className }: { tx: TransactionRow; className?: string }) {
  const dir = direction(tx.type);
  const sign = dir === "in" ? "+" : dir === "out" ? "−" : "";
  return (
    <span className={cn("tabular flex flex-col items-end", className)}>
      <span
        className={cn(
          "font-semibold whitespace-nowrap",
          dir === "in" && "text-income",
          dir === "neutral" && "text-muted-foreground",
          tx.status === "anulado" && "text-muted-foreground line-through",
        )}
      >
        {sign}
        {formatPEN(Number(tx.amount_pen))}
      </span>
      {tx.currency !== "PEN" && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatMoney(Number(tx.amount), tx.currency)} · TC {Number(tx.fx_rate).toFixed(3)}
        </span>
      )}
    </span>
  );
}
