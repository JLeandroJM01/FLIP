"use client";

import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isActive, SIDEBAR_ITEMS } from "./nav-items";

const STORAGE_KEY = "flip:sidebar-expanded";

/**
 * Tablet (768–1024 px): barra lateral colapsable (solo iconos por defecto).
 * Computadora (> 1024 px): barra lateral fija y expandida.
 */
export function Sidebar({ pendingReview }: { pendingReview: number }) {
  const pathname = usePathname();
  const { openQuickAdd } = useQuickAdd();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
    setExpanded(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setExpanded((v) => {
      localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  // En lg siempre se ve expandida; en md depende de `expanded`.
  const showLabels = expanded ? "inline" : "hidden lg:inline";

  return (
    <aside
      data-expanded={expanded}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex",
        expanded ? "w-60" : "w-[4.5rem] lg:w-60",
      )}
    >
      <div className="flex h-11 items-center justify-between px-1">
        <Link href="/" className={cn("text-xl font-semibold tracking-tight text-primary", showLabels)}>
          FLIP
        </Link>
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={toggle}
          className="lg:hidden"
          aria-label={expanded ? "Colapsar menú" : "Expandir menú"}
        >
          {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </div>

      <Button size="touch" className="mt-4 w-full justify-center" onClick={() => openQuickAdd("gasto")} aria-label="Registrar">
        <Plus className="size-5" />
        <span className={showLabels}>Registrar</span>
      </Button>

      <nav className="mt-6 flex flex-col gap-1" aria-label="Principal">
        {SIDEBAR_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5 shrink-0", active && "text-primary")} />
              <span className={cn("flex-1", showLabels)}>{label}</span>
              {href === "/movimientos" && pendingReview > 0 && (
                <Badge className={showLabels}>{pendingReview}</Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <p className={cn("mt-auto px-3 text-xs text-muted-foreground", showLabels)}>
        Finanzas y Liderazgo Inteligente con un Propósito
      </p>
    </aside>
  );
}
