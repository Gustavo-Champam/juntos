import {
  CalendarDays,
  CookingPot,
  Home,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";

export const primaryNavigation = [
  { label: "Início", href: "/", icon: Home },
  { label: "Agenda", href: "/agenda", icon: CalendarDays },
  { label: "Comidas", href: "/comidas", icon: CookingPot },
  { label: "Compras", href: "/compras", icon: ShoppingBasket },
  { label: "Pedir", href: "/pedir", icon: Sparkles },
] as const;