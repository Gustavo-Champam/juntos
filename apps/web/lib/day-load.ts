import { civilInstant } from "@juntos/contracts";

import type { CalendarEvent, PlannedMeal } from "@/features/timeline/types";
import { household } from "@/lib/household-client";

const FALLBACK: Record<string, string> = {
  breakfast: "07:15",
  lunch: "12:30",
  dinner: "19:00",
};

export async function loadDay(date: string): Promise<{ events: CalendarEvent[]; meals: PlannedMeal[] }> {
  const [agenda, meals] = await Promise.all([
    household.agenda(date, date) as Promise<{
      snapshot?: {
        members: { id: string; name: string }[];
        occurrences: {
          occurrenceId: string;
          date: string;
          startsAt: string;
          endsAt: string;
          event: { title: string; location: string; assigneeId: string | null };
        }[];
      };
    }>,
    household.meals(date, date) as Promise<
      Array<{
        id: string;
        date: string;
        mealType: "breakfast" | "lunch" | "dinner";
        title: string;
        prepMinutes: number;
        quick: boolean;
        time?: string;
      }>
    >,
  ]);
  const members = new Map((agenda.snapshot?.members ?? []).map((member) => [member.id, member.name]));
  const events: CalendarEvent[] = (agenda.snapshot?.occurrences ?? [])
    .filter((item) => item.date === date)
    .map((item) => ({
      id: item.occurrenceId,
      title: item.event.title,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      owner: (item.event.assigneeId ? members.get(item.event.assigneeId) : "Ambos") ?? "Ambos",
      location: item.event.location,
    }));
  const planned: PlannedMeal[] = (meals ?? []).map((meal) => ({
    id: meal.id,
    title: meal.title,
    startsAt: civilInstant(meal.date, meal.time || FALLBACK[meal.mealType] || "12:30"),
    mealType: meal.mealType,
    quick: meal.quick,
    prepMinutes: meal.prepMinutes,
  }));
  return { events, meals: planned };
}
