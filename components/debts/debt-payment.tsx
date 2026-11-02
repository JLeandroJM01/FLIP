"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/app/(app)/actions";
import { registerDebtPayment } from "@/app/(app)/deudas/actions";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLimaDateTimeLocal } from "@/lib/dates";
import type { Account } from "@/lib/types";

export type DebtLite = { id: string; name: string; currency: "PEN" | "USD"; balance: number; suggested: number | null };

/** "Registrar pago" (SPEC 11): baja el saldo de la deuda y registra la salida de plata (no es gasto). */
export function DebtPaymentButton({ debt, accounts }: { debt: DebtLite; accounts: Account[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await registerDebtPayment(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "Pago registrado");
      setOpen(false);
    }
    return result;
  }, { ok: false });
  const usable = accounts.filter((a) => ["corriente", "ahorros", "billetera"].includes(a.type));
  const symbol = debt.currency === "USD" ? "US$" : "S/";

  return (
    <>
      <Button variant="secondary" size="touch" onClick={() => setOpen(true)}>
        Registrar pago
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={`Pago a ${debt.name}`}>
        <form action={action} className="min-w-0 space-y-4 pb-2">
          <input type="hidden" name="debt_id" value={debt.id} />
          <div className="space-y-2">
            <Label htmlFor="debt-amount">Monto ({symbol})</Label>
            <Input id="debt-amount" name="amount" inputMode="decimal" autoFocus defaultValue={debt.suggested ?? ""} className="tabular h-14 text-2xl" />
            {state.fieldErrors?.amount && <p className="text-sm text-destructive">{state.fieldErrors.amount}</p>}
          </div>
          {debt.currency === "USD" && (
            <div className="space-y-2">
              <Label htmlFor="debt-fx">Tipo de cambio (si pagas en soles; vacío = el último guardado)</Label>
              <Input id="debt-fx" name="fx_rate" inputMode="decimal" className="tabular h-11 w-32" />
              {state.fieldErrors?.fx_rate && <p className="text-sm text-destructive">{state.fieldErrors.fx_rate}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="debt-account">Pagado desde</Label>
            <select id="debt-account" name="account_id" className="h-11 w-full rounded-lg border bg-input/30 px-3 text-sm">
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt-date">Fecha</Label>
            <Input id="debt-date" name="occurred_at" type="datetime-local" defaultValue={toLimaDateTimeLocal(new Date())} className="h-11" />
          </div>
          {state.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" size="touch" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : "Registrar pago"}
          </Button>
        </form>
      </ResponsiveSheet>
    </>
  );
}
