"use client";

import { UserPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createPerson, createSharedExpense } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { round2 } from "@/lib/finance";
import { formatPEN } from "@/lib/format";
import type { Person, TransactionRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** SPEC 8: total, mi parte (o partes iguales), personas y cuánto debe cada una. */
export function SharedExpenseForm({
  transaction,
  people: initialPeople,
  onDone,
}: {
  transaction: TransactionRow;
  people: Person[];
  onDone: () => void;
}) {
  const total = Number(transaction.amount_pen);
  const [people, setPeople] = useState(initialPeople);
  const [selected, setSelected] = useState<string[]>([]);
  const [equal, setEqual] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [newPerson, setNewPerson] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const split = useMemo(() => {
    if (equal) {
      const each = selected.length ? Math.floor((total / (selected.length + 1)) * 100) / 100 : 0;
      const others = Object.fromEntries(selected.map((id) => [id, each]));
      return { others, mine: round2(total - each * selected.length) };
    }
    const others = Object.fromEntries(selected.map((id) => [id, Number(amounts[id] || 0)]));
    return { others, mine: round2(total - Object.values(others).reduce((s, x) => s + x, 0)) };
  }, [equal, selected, amounts, total]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function addPerson() {
    if (!newPerson?.trim()) return;
    startTransition(async () => {
      const { person, error } = await createPerson(newPerson);
      if (!person) return void toast.error(error ?? "No se pudo guardar");
      setPeople((l) => [...l, person].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected((s) => [...s, person.id]);
      setNewPerson(null);
    });
  }

  function save() {
    startTransition(async () => {
      const res = await createSharedExpense({
        transaction_id: transaction.id,
        my_share: split.mine,
        participants: selected.map((id) => ({ person_id: id, amount: split.others[id] })),
      });
      if (!res.ok) return void toast.error(res.message ?? "No se pudo guardar");
      toast.success(res.message ?? "Guardado");
      onDone();
    });
  }

  const invalid = selected.length === 0 || split.mine < 0 || Object.values(split.others).some((x) => !(x > 0));

  return (
    <div className="min-w-0 space-y-5">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{formatPEN(total)}</strong> en {transaction.merchant || transaction.note || "este gasto"}. En tus
        gastos contará solo tu parte; lo demás queda en &quot;Te deben&quot;.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Con quién?</legend>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected.includes(p.id)}
              onClick={() => toggle(p.id)}
              className={cn(
                "h-11 rounded-full border px-4 text-sm",
                selected.includes(p.id) ? "border-primary bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              {p.name}
            </button>
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
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPerson())}
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
      </fieldset>

      <div role="radiogroup" aria-label="Cómo se divide" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {[
          [true, "Partes iguales"],
          [false, "Montos distintos"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={equal === value}
            onClick={() => setEqual(value as boolean)}
            className={cn("h-11 rounded-lg text-sm font-medium", equal === value ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {label as string}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {selected.map((id) => {
            const person = people.find((p) => p.id === id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Label htmlFor={`owe-${id}`} className="truncate">
                  {person?.name} te debe
                </Label>
                {equal ? (
                  <span className="tabular font-medium">{formatPEN(split.others[id])}</span>
                ) : (
                  <Input
                    id={`owe-${id}`}
                    inputMode="decimal"
                    value={amounts[id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [id]: e.target.value }))}
                    placeholder="0.00"
                    className="tabular h-11 w-28 text-right"
                  />
                )}
              </li>
            );
          })}
          <li className="flex items-center justify-between px-3 py-2 font-medium">
            <span>Tu parte</span>
            <span className={cn("tabular", split.mine < 0 && "text-destructive")}>{formatPEN(split.mine)}</span>
          </li>
        </ul>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-popover from-75% to-transparent px-4 pt-4 pb-2">
        <Button size="touch" className="w-full" onClick={save} disabled={pending || invalid}>
          {pending ? "Guardando…" : "Guardar gasto compartido"}
        </Button>
      </div>
    </div>
  );
}
