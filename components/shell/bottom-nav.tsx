"use client";

import { ArrowLeftRight, Home, Menu, Plus, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuickAdd } from "@/components/quick-add/quick-add-provider";
import { cn } from "@/lib/utils";
import { isActive } from "./nav-items";

/** Celular (< 768 px): Inicio · Movimientos · + · Metas · Más (SPEC 13). */
export function BottomNav({ pendingReview }: { pendingReview: number }) {
  const pathname = usePathname();
  const { openQuickAdd } = useQuickAdd();

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        <NavLink href="/" label="Inicio" icon={Home} active={isActive(pathname, "/")} />
        <NavLink
          href="/movimientos"
          label="Movimientos"
          icon={ArrowLeftRight}
          active={isActive(pathname, "/movimientos")}
          badge={pendingReview}
        />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => openQuickAdd("gasto")}
            aria-label="Registrar"
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 active:scale-95"
          >
            <Plus className="size-7" />
          </button>
        </div>
        <NavLink href="/metas" label="Metas" icon={Target} active={isActive(pathname, "/metas")} />
        <NavLink
          href="/mas"
          label="Más"
          icon={Menu}
          active={isActive(pathname, "/mas") || isActive(pathname, "/ajustes")}
        />
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px]",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
      {!!badge && (
        <span className="absolute top-2 right-[calc(50%-1.25rem)] min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}
