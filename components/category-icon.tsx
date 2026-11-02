import {
  Award, Banknote, Bike, Briefcase, Building2, Bus, CircleEllipsis, CirclePlus, Cookie, Gift,
  GraduationCap, Heart, HeartPulse, Landmark, PartyPopper, Percent, PiggyBank, Repeat,
  ShoppingBag, Smartphone, Sparkles, TreePalm, TrendingUp, UserRound, Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Iconos disponibles para categorías (nombres lucide guardados en categories.icon). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, bike: Bike, "party-popper": PartyPopper, cookie: Cookie, bus: Bus,
  smartphone: Smartphone, repeat: Repeat, "shopping-bag": ShoppingBag, "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap, gift: Gift, heart: Heart, banknote: Banknote,
  "user-round": UserRound, landmark: Landmark, percent: Percent, "circle-ellipsis": CircleEllipsis,
  briefcase: Briefcase, sparkles: Sparkles, "piggy-bank": PiggyBank, "trending-up": TrendingUp,
  award: Award, "tree-palm": TreePalm, "building-2": Building2, "circle-plus": CirclePlus,
};

export function CategoryIcon({
  icon,
  color,
  className,
  size = "md",
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || CircleEllipsis;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "md" ? "size-10" : "size-8",
        className,
      )}
      style={{ backgroundColor: `${color ?? "#9a9a9a"}22`, color: color ?? "#9a9a9a" }}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} aria-hidden />
    </span>
  );
}
