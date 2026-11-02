"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Account, Category, Tag } from "@/lib/types";
import { cn } from "@/lib/utils";

export type FilterOptions = {
  months: { value: string; label: string }[];
  accounts: Pick<Account, "id" | "name">[];
  categories: Pick<Category, "id" | "name" | "kind">[];
  tags: Pick<Tag, "name">[];
};

const SELECT =
  "h-11 w-full min-w-0 rounded-lg border bg-input/30 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Filtros en la URL (?mes=&cuenta=&categoria=&etiqueta=&q=). En celular se pliegan. */
export function TransactionFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const active = ["cuenta", "categoria", "etiqueta"].filter((k) => params.get(k)).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={params.get("q") ?? ""}
            placeholder="Buscar comercio o nota"
            className="h-11 pl-9"
            aria-label="Buscar"
          />
        </form>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal /> Filtros{active > 0 && ` (${active})`}
        </Button>
      </div>

      <div className={cn("grid grid-cols-2 gap-2 lg:grid lg:grid-cols-4", !open && "hidden")}>
        <Select label="Mes" value={params.get("mes") ?? ""} onChange={(v) => update("mes", v)}>
          {options.months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select label="Cuenta" value={params.get("cuenta") ?? ""} onChange={(v) => update("cuenta", v)}>
          <option value="">Todas las cuentas</option>
          {options.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select label="Categoría" value={params.get("categoria") ?? ""} onChange={(v) => update("categoria", v)}>
          <option value="">Todas las categorías</option>
          {(["gasto", "ingreso"] as const).map((kind) => (
            <optgroup key={kind} label={kind === "gasto" ? "Gastos" : "Ingresos"}>
              {options.categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <Select label="Etiqueta" value={params.get("etiqueta") ?? ""} onChange={(v) => update("etiqueta", v)}>
          <option value="">Todas las etiquetas</option>
          {options.tags.map((t) => (
            <option key={t.name} value={t.name}>
              #{t.name}
            </option>
          ))}
        </Select>
        {active > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="col-span-2 lg:col-span-4 lg:justify-self-start"
            onClick={() => {
              const next = new URLSearchParams(params);
              ["cuenta", "categoria", "etiqueta"].forEach((k) => next.delete(k));
              startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
            }}
          >
            <X /> Quitar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
