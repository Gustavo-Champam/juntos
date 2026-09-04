import type { CalendarEvent, PlannedMeal } from "./types";

export const demoDate = "2026-09-04";

export const demoEvents: CalendarEvent[] = [
  {
    id: "work-focus",
    title: "Começar o trabalho",
    startsAt: "2026-09-04T08:30:00-03:00",
    endsAt: "2026-09-04T12:00:00-03:00",
    owner: "Ambos",
    location: "Trabalho",
  },
  {
    id: "college-night",
    title: "Faculdade",
    startsAt: "2026-09-04T19:00:00-03:00",
    endsAt: "2026-09-04T22:30:00-03:00",
    owner: "Ambos",
    location: "Campus",
  },
];

export const demoMeals: PlannedMeal[] = [
  {
    id: "breakfast-yogurt",
    title: "Iogurte, fruta e granola",
    startsAt: "2026-09-04T07:15:00-03:00",
    mealType: "breakfast",
    quick: true,
    prepMinutes: 5,
  },
  {
    id: "lunch-chicken",
    title: "Arroz, feijão e frango grelhado",
    startsAt: "2026-09-04T12:30:00-03:00",
    mealType: "lunch",
    quick: false,
    prepMinutes: 35,
  },
  {
    id: "dinner-wrap",
    title: "Wrap de frango e salada",
    startsAt: "2026-09-04T17:45:00-03:00",
    mealType: "dinner",
    quick: true,
    prepMinutes: 15,
  },
];
