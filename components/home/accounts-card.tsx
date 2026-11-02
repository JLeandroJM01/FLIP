import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPEN } from "@/lib/format";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIQUID = new Set(["corriente", "ahorros", "billetera"]);

/** Saldos (SPEC 4) y uso de la tarjeta de crédito (SPEC 10: meta < 30% de la línea). */
export function AccountsCard({ accounts, balances }: { accounts: Account[]; balances: Map<string, number | null> }) {
  const known = accounts.filter((a) => balances.get(a.id) != null);
  const liquid = known.filter((a) => LIQUID.has(a.type));
  const cards = known.filter((a) => a.type === "credito");
  const assets = known.filter((a) => a.type === "activo");
  const totalPen = liquid.filter((a) => a.currency === "PEN").reduce((sum, a) => sum + balances.get(a.id)!, 0);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Disponible en tus cuentas</CardDescription>
        <CardTitle className="tabular text-3xl">{formatPEN(totalPen)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="space-y-2">
          {[...liquid, ...assets].map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-muted-foreground">{a.name}</span>
              <span className="tabular font-medium">{formatMoney(balances.get(a.id)!, a.currency)}</span>
            </li>
          ))}
        </ul>
        {cards.map((a) => {
          const used = -balances.get(a.id)!;
          const limit = Number(a.credit_limit ?? 0);
          const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
          return (
            <div key={a.id} className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{a.name}</span>
                <span className="tabular font-medium">
                  {formatPEN(used)}
                  {limit > 0 && <span className="font-normal text-muted-foreground"> de {formatPEN(limit)}</span>}
                </span>
              </div>
              {limit > 0 && (
                <>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Línea usada de ${a.name}`}
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={cn("h-full rounded-full", pct > 80 ? "bg-destructive" : pct > 30 ? "bg-amber-400" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Usas el {Math.round(pct)}% de la línea. La meta es menos del 30%.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
