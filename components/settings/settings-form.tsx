"use client";

import { createContext, useActionState, useContext, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ErrorsContext = createContext<Record<string, string>>({});

/** Formulario de ajustes: Server Action + aviso al guardar + errores por campo. */
export function SettingsForm({
  action,
  submitLabel = "Guardar",
  className,
  children,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });

  useEffect(() => {
    if (state.ok && state.savedAt) toast.success(state.message ?? "Guardado");
    else if (!state.ok && state.message && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  return (
    <ErrorsContext value={state.fieldErrors ?? {}}>
      <form action={formAction} className={cn("space-y-4", className)}>
        {children}
        {state.fieldErrors && <p className="text-sm text-destructive">{state.message}</p>}
        <Button type="submit" size="touch" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </form>
    </ErrorsContext>
  );
}

export function Field({
  label,
  name,
  hint,
  className,
  id: idSuffix,
  ...props
}: React.ComponentProps<"input"> & { label: string; name: string; hint?: string }) {
  const error = useContext(ErrorsContext)[name];
  // `id` distingue formularios repetidos (una cuenta, una categoría…).
  const id = `f-${name}-${idSuffix ?? ""}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={!!error} className="h-11" {...props} />
      {error ? <p className="text-sm text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  children,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: ReactNode;
  className?: string;
}) {
  const error = useContext(ErrorsContext)[name];
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <select
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        className="h-11 w-full rounded-lg border bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
