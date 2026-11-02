"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { SharedExpenseForm } from "@/components/shared/shared-expense-form";
import type { Catalogs, QuickKind, TransactionRow } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

type OpenOptions = { accountId?: string; personId?: string };

type QuickAddContextValue = {
  openQuickAdd: (kind?: QuickKind, options?: OpenOptions) => void;
  openEdit: (transaction: TransactionRow) => void;
  openShared: (transaction: TransactionRow) => void;
};

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

type SheetState =
  | { open: false }
  | { open: true; mode: "form"; kind: QuickKind; accountId?: string; personId?: string; transaction?: TransactionRow; key: number }
  | { open: true; mode: "shared"; transaction: TransactionRow; key: number };

const TITLES: Record<QuickKind, string> = {
  gasto: "Registrar",
  ingreso: "Registrar",
  reembolso: "Registrar",
};

export function QuickAddProvider({ catalogs, children }: { catalogs: Catalogs; children: ReactNode }) {
  const [state, setState] = useState<SheetState>({ open: false });

  const openQuickAdd = useCallback((kind: QuickKind = "gasto", options?: OpenOptions) => {
    setState({ open: true, mode: "form", kind, accountId: options?.accountId, personId: options?.personId, key: Date.now() });
  }, []);

  const openEdit = useCallback((transaction: TransactionRow) => {
    const kind: QuickKind =
      transaction.type === "ingreso" ? "ingreso" : transaction.type === "reembolso" ? "reembolso" : "gasto";
    setState({ open: true, mode: "form", kind, transaction, key: Date.now() });
  }, []);

  const openShared = useCallback((transaction: TransactionRow) => {
    setState({ open: true, mode: "shared", transaction, key: Date.now() });
  }, []);

  const close = useCallback(() => setState({ open: false }), []);
  const value = useMemo(() => ({ openQuickAdd, openEdit, openShared }), [openQuickAdd, openEdit, openShared]);

  return (
    <QuickAddContext value={value}>
      {children}
      <ResponsiveSheet
        open={state.open}
        onOpenChange={(open) => !open && close()}
        title={
          !state.open
            ? "Registrar"
            : state.mode === "shared"
              ? "¿Con quién lo compartiste?"
              : state.transaction
                ? "Editar movimiento"
                : TITLES[state.kind]
        }
      >
        {state.open && state.mode === "form" && (
          <TransactionForm
            key={state.key}
            catalogs={catalogs}
            initialKind={state.kind}
            initialAccountId={state.accountId}
            initialPersonId={state.personId}
            transaction={state.transaction}
            onDone={close}
            onShare={(tx) => openShared(tx)}
          />
        )}
        {state.open && state.mode === "shared" && (
          <SharedExpenseForm key={state.key} transaction={state.transaction} people={catalogs.people} onDone={close} />
        )}
      </ResponsiveSheet>
    </QuickAddContext>
  );
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd debe usarse dentro de QuickAddProvider");
  return ctx;
}
