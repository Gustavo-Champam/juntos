import {
  CalendarDays,
  CookingPot,
  Home,
  ShoppingBasket,
} from "lucide-react";

export const primaryNavigation = [
  { label: "Início", href: "/", icon: Home },
  { label: "Agenda", href: "/agenda", icon: CalendarDays },
  { label: "Comidas", href: "/comidas", icon: CookingPot },
  { label: "Compras", href: "/compras", icon: ShoppingBasket },
] as const;
