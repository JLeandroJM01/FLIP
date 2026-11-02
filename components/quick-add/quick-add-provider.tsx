"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import type { Catalogs, QuickKind, TransactionRow } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

type OpenOptions = { accountId?: string };

type QuickAddContextValue = {
  openQuickAdd: (kind?: QuickKind, options?: OpenOptions) => void;
  openEdit: (transaction: TransactionRow) => void;
};

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

type SheetState =
  | { open: false }
  | { open: true; kind: QuickKind; accountId?: string; transaction?: TransactionRow; key: number };

const TITLES: Record<QuickKind, string> = {
  gasto: "Registrar",
  ingreso: "Registrar",
  reembolso: "Registrar",
};

export function QuickAddProvider({ catalogs, children }: { catalogs: Catalogs; children: ReactNode }) {
  const [state, setState] = useState<SheetState>({ open: false });

  const openQuickAdd = useCallback((kind: QuickKind = "gasto", options?: OpenOptions) => {
    setState({ open: true, kind, accountId: options?.accountId, key: Date.now() });
  }, []);

  const openEdit = useCallback((transaction: TransactionRow) => {
    const kind: QuickKind =
      transaction.type === "ingreso" ? "ingreso" : transaction.type === "reembolso" ? "reembolso" : "gasto";
    setState({ open: true, kind, transaction, key: Date.now() });
  }, []);

  const close = useCallback(() => setState({ open: false }), []);
  const value = useMemo(() => ({ openQuickAdd, openEdit }), [openQuickAdd, openEdit]);

  return (
    <QuickAddContext value={value}>
      {children}
      <ResponsiveSheet
        open={state.open}
        onOpenChange={(open) => !open && close()}
        title={state.open && state.transaction ? "Editar movimiento" : state.open ? TITLES[state.kind] : "Registrar"}
      >
        {state.open && (
          <TransactionForm
            key={state.key}
            catalogs={catalogs}
            initialKind={state.kind}
            initialAccountId={state.accountId}
            transaction={state.transaction}
            onDone={close}
          />
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
