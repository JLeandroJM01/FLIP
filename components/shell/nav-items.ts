import { ArrowLeftRight, CreditCard, Home, Landmark, Settings, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Barra lateral (tablet y computadora). */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/tarjeta", label: "Tarjeta", icon: CreditCard },
  { href: "/deudas", label: "Deudas", icon: Landmark },
  { href: "/ingresos", label: "Ingresos", icon: Wallet },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/** En el celular, estas pantallas se abren desde "Más". */
export const MORE_ITEMS = SIDEBAR_ITEMS.filter((i) => ["/tarjeta", "/deudas", "/ingresos", "/ajustes"].includes(i.href));

/** Pantallas del SPEC que llegan en fases siguientes (se muestran en "Más"). */
export const UPCOMING = [{ label: "Análisis", phase: "Fase 4" }];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
