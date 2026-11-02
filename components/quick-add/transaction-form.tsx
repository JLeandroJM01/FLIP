"use client";

import { Ban, CheckCircle2, RotateCcw, UserPlus } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createPerson, getFxRate, saveTransaction, setTransactionStatus, type ActionState } from "@/app/(app)/actions";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { limaDateKey, toLimaDateTimeLocal } from "@/lib/dates";
import type { Account, Catalogs, CurrencyCode, Person, QuickKind, TransactionRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<QuickKind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  reembolso: "Me yapearon",
};

const SUBMIT_LABELS: Record<QuickKind, string> = {
  gasto: "Guardar gasto",
  ingreso: "Guardar ingreso",
  reembolso: "Guardar yapeo",
};

/** Cuentas que tiene sentido elegir según el tipo de registro. */
function accountsFor(kind: QuickKind, accounts: Account[]) {
  if (kind === "gasto") return accounts.filter((a) => !["activo", "empresa"].includes(a.type));
  if (kind === "ingreso") return accounts.filter((a) => a.type !== "empresa");
  return accounts.filter((a) => ["corriente", "ahorros", "billetera"].includes(a.type));
}

export function TransactionForm({
  catalogs,
  initialKind,
  initialAccountId,
  transaction,
  onDone,
}: {
  catalogs: Catalogs;
  initialKind: QuickKind;
  initialAccountId?: string;
  /** Si viene, el formulario edita este movimiento. */
  transaction?: TransactionRow;
  onDone: () => void;
}) {
  const editing = !!transaction;
  const [kind, setKind] = useState<QuickKind>(initialKind);
  const [currency, setCurrency] = useState<CurrencyCode>(transaction?.currency ?? "PEN");
  const [fxRate, setFxRate] = useState(transaction?.fx_rate ? String(transaction.fx_rate) : "");
  const [fxInfo, setFxInfo] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>(catalogs.people);
  const [personId, setPersonId] = useState(transaction?.person_id ?? "");
  const [newPerson, setNewPerson] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction, saving] = useActionState<ActionState, FormData>(saveTransaction, { ok: false });
  const amountRef = useRef<HTMLInputElement>(null);

  const accounts = useMemo(() => accountsFor(kind, catalogs.accounts), [kind, catalogs.accounts]);
  const defaultAccount =
    transaction?.account_id ??
    (initialAccountId && initialKind === kind ? initialAccountId : undefined) ??
    catalogs.defaultAccounts[kind] ??
    accounts[0]?.id;
  const categories = catalogs.categories.filter((c) => c.kind === kind);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    toast.success(state.message ?? "Guardado");
    onDone();
  }, [state, onDone]);

  async function switchCurrency(next: CurrencyCode) {
    setCurrency(next);
    if (next === "USD" && !fxRate) {
      const quote = await getFxRate(limaDateKey(new Date()));
      if (quote) {
        setFxRate(String(quote.rate));
        setFxInfo(quote.source === "bcrp" ? `BCRP del ${quote.date}` : `Manual del ${quote.date}`);
      } else {
        setFxInfo("No se pudo obtener del BCRP: escríbelo");
      }
    }
  }

  function addPerson() {
    if (!newPerson?.trim()) return;
    startTransition(async () => {
      const { person, error } = await createPerson(newPerson);
      if (error || !person) {
        toast.error(error ?? "No se pudo guardar");
        return;
      }
      setPeople((list) => [...list, person].sort((a, b) => a.name.localeCompare(b.name)));
      setPersonId(person.id);
      setNewPerson(null);
    });
  }

  function changeStatus(status: "anulado" | "confirmado") {
    if (!transaction) return;
    startTransition(async () => {
      const res = await setTransactionStatus(transaction.id, status);
      if (!res.ok) return void toast.error(res.message ?? "No se pudo actualizar");
      toast.success(status === "anulado" ? "Movimiento anulado" : "Movimiento confirmado");
      onDone();
    });
  }

  // Los gastos/ingresos que vienen de Gmail pueden tener tipos que este formulario no edita.
  const editableType = !transaction || ["gasto", "ingreso", "reembolso"].includes(transaction.type);

  return (
    <form action={formAction} className="min-w-0 space-y-5" key={kind}>
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value={currency} />

      {transaction && (transaction.merchant || transaction.source !== "manual") && (
        <p className="text-sm text-muted-foreground">
          {transaction.merchant && <strong className="text-foreground">{transaction.merchant}</strong>}
          {transaction.source === "gmail" && " · desde Gmail"}
          {transaction.source === "recurrente" && " · registro automático"}
          {transaction.note && ` · ${transaction.note}`}
        </p>
      )}

      {(!editing || transaction?.status === "por_revisar") && (
        <div role="radiogroup" aria-label="Tipo de registro" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {(Object.keys(KIND_LABELS) as QuickKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-11 rounded-lg text-sm font-medium transition-colors",
                kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {/* Monto */}
      <div className="space-y-2">
        <Label htmlFor="amount">Monto</Label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => switchCurrency(currency === "PEN" ? "USD" : "PEN")}
            className="h-14 min-w-16 rounded-xl border bg-muted px-3 text-lg font-semibold text-primary"
            aria-label={`Moneda: ${currency === "PEN" ? "soles" : "dólares"}. Cambiar`}
          >
            {currency === "PEN" ? "S/" : "US$"}
          </button>
          <Input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus={!editing}
            defaultValue={transaction ? String(transaction.amount) : ""}
            aria-invalid={!!errors.amount}
            className="tabular h-14 rounded-xl text-3xl font-semibold md:text-3xl"
          />
        </div>
        {errors.amount && <FieldError>{errors.amount}</FieldError>}
        {currency === "USD" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="fx_rate" className="shrink-0 text-muted-foreground">
              Tipo de cambio
            </Label>
            <Input
              id="fx_rate"
              name="fx_rate"
              inputMode="decimal"
              value={fxRate}
              onChange={(e) => {
                setFxRate(e.target.value);
                setFxInfo("Manual");
              }}
              className="tabular h-11 w-28"
              aria-invalid={!!errors.fx_rate}
            />
            {fxInfo && <span className="text-xs text-muted-foreground">{fxInfo}</span>}
          </div>
        )}
        {errors.fx_rate && <FieldError>{errors.fx_rate}</FieldError>}
      </div>

      {/* Categoría o persona */}
      {kind === "reembolso" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">¿Quién te yapeó?</legend>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <Chip key={p.id} name="person_id" value={p.id} checked={personId === p.id} onChange={() => setPersonId(p.id)}>
                {p.name}
              </Chip>
            ))}
            {newPerson === null ? (
              <Button type="button" variant="outline" size="touch" onClick={() => setNewPerson("")}>
                <UserPlus /> Persona
              </Button>
            ) : (
              <div className="flex w-full gap-2">
                <Input
                  autoFocus
                  value={newPerson}
                  onChange={(e) => setNewPerson(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPerson();
                    }
                  }}
                  placeholder="Nombre"
                  className="h-11"
                  aria-label="Nombre de la persona"
                />
                <Button type="button" size="touch" onClick={addPerson} disabled={pending}>
                  Agregar
                </Button>
              </div>
            )}
          </div>
          {errors.person_id && <FieldError>{errors.person_id}</FieldError>}
          <p className="text-xs text-muted-foreground">Se guarda como reembolso: resta de tu gasto del mes, no es ingreso.</p>
        </fieldset>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Categoría</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {categories.map((c) => (
              <label
                key={c.id}
                className="group flex min-h-20 cursor-pointer flex-col items-center justify-start gap-1 rounded-xl border border-transparent p-1.5 text-center has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name="category_id"
                  value={c.id}
                  defaultChecked={transaction?.category_id === c.id}
                  className="sr-only"
                />
                <CategoryIcon icon={c.icon} color={c.color} />
                <span className="text-[11px] leading-tight text-muted-foreground group-has-[:checked]:text-foreground">
                  {c.name}
                </span>
              </label>
            ))}
          </div>
          {errors.category_id && <FieldError>{errors.category_id}</FieldError>}
        </fieldset>
      )}

      {/* Cuenta */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{kind === "gasto" ? "Pagado con" : "Entró a"}</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {/* La cuenta por defecto va primero para que se vea sin desplazar. */}
          {[...accounts].sort((a, b) => Number(b.id === defaultAccount) - Number(a.id === defaultAccount)).map((a) => (
            <Chip key={a.id} name="account_id" value={a.id} defaultChecked={a.id === defaultAccount}>
              {a.name}
            </Chip>
          ))}
        </div>
        {errors.account_id && <FieldError>{errors.account_id}</FieldError>}
      </fieldset>

      {transaction?.merchant && kind !== "reembolso" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm has-[:checked]:border-primary">
          <input type="checkbox" name="apply_rule" value="1" className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>
            Usar siempre esta categoría para <strong className="break-words">{transaction.merchant}</strong>
            <span className="block text-xs text-muted-foreground">También se aplica a los anteriores sin categoría.</span>
          </span>
        </label>
      )}

      <div className="space-y-2">
        <Label htmlFor="note">Nota (opcional)</Label>
        <Input
          id="note"
          name="note"
          placeholder={kind === "gasto" ? "Almuerzo, pasaje…" : "Detalle"}
          defaultValue={transaction?.note ?? ""}
          maxLength={200}
          className="h-11"
        />
      </div>

      <details className="group rounded-xl border px-3 open:pb-3" open={editing}>
        <summary className="flex h-11 cursor-pointer items-center text-sm text-muted-foreground">
          Fecha y etiquetas
        </summary>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="occurred_at">Fecha y hora</Label>
            <Input
              id="occurred_at"
              name="occurred_at"
              type="datetime-local"
              defaultValue={toLimaDateTimeLocal(transaction ? new Date(transaction.occurred_at) : new Date())}
              className="h-11"
            />
            {errors.occurred_at && <FieldError>{errors.occurred_at}</FieldError>}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Etiquetas</legend>
            <div className="flex flex-wrap gap-2">
              {catalogs.tags.map((t) => (
                <Chip key={t.id} type="checkbox" name="tags" value={t.name} defaultChecked={transaction?.tags.includes(t.name)}>
                  #{t.name}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      {state.message && !state.ok && <FieldError>{state.message}</FieldError>}

      {editableType && (
        // Fijo abajo de la hoja: se puede guardar sin bajar hasta el final.
        <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-popover from-75% to-transparent px-4 pt-4 pb-2">
          <Button type="submit" size="touch" className="w-full" disabled={saving}>
            {saving
            ? "Guardando…"
            : transaction?.status === "por_revisar"
              ? "Guardar y confirmar"
              : editing
                ? "Guardar cambios"
                : SUBMIT_LABELS[kind]}
          </Button>
        </div>
      )}

      {transaction && (
        <div className="flex gap-2">
          {transaction.status === "por_revisar" && (
            <Button type="button" variant="secondary" size="touch" className="flex-1" onClick={() => changeStatus("confirmado")} disabled={pending}>
              <CheckCircle2 /> Confirmar
            </Button>
          )}
          {transaction.status === "anulado" ? (
            <Button type="button" variant="secondary" size="touch" className="flex-1" onClick={() => changeStatus("confirmado")} disabled={pending}>
              <RotateCcw /> Restaurar
            </Button>
          ) : (
            <Button type="button" variant="destructive" size="touch" className="flex-1" onClick={() => changeStatus("anulado")} disabled={pending}>
              <Ban /> Anular
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function Chip({
  children,
  type = "radio",
  checked,
  onChange,
  ...props
}: React.ComponentProps<"input"> & { children: React.ReactNode }) {
  return (
    <label className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border px-4 text-sm whitespace-nowrap text-muted-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <input type={type} className="sr-only" checked={checked} onChange={onChange} {...props} />
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-destructive">{children}</p>;
}
