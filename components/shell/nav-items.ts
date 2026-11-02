import { ArrowLeftRight, Home, Settings, Target, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Barra lateral (tablet y computadora). */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/** Pantallas del SPEC que llegan en fases siguientes (se muestran en "Más"). */
export const UPCOMING = [
  { label: "Tarjeta", phase: "Fase 3" },
  { label: "Deudas", phase: "Fase 3" },
  { label: "Ingresos", phase: "Fase 3" },
  { label: "Empresa", phase: "Fase 3" },
  { label: "Análisis", phase: "Fase 4" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
