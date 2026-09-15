import "server-only";

import { addCivilDays, civilInstant, civilToday } from "@juntos/contracts";
import { cookies } from "next/headers";

import type { CalendarEvent, PlannedMeal } from "@/features/timeline/types";
import { cookieConfig, opaqueTokenPattern } from "./auth-cookies";
import { backendFetch } from "./api-client";

const MEAL_TIMES: Record<string, string> = {
  breakfast: "07:15",
  lunch: "12:30",
  dinner: "19:00",
};

async function session(): Promise<string | null> {
  const value = (await cookies()).get(cookieConfig("session").name)?.value;
  return value && opaqueTokenPattern.test(value) ? value : null;
}

async function postInternal<T>(path: string, body: unknown, token: string): Promise<T | null> {
  const response = await backendFetch(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    token,
  );
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function loadHomeDay(date = civilToday()): Promise<{
  date: string;
  events: CalendarEvent[];
  meals: PlannedMeal[];
}> {
  const token = await session();
  if (!token) return { date, events: [], meals: [] };

  const [agenda, meals] = await Promise.all([
    postInternal<{
      changed: boolean;
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
    }>("/internal/agenda/list", { from: date, to: date }, token),
    postInternal<
      Array<{
        id: string;
        date: string;
        mealType: "breakfast" | "lunch" | "dinner";
        title: string;
        prepMinutes: number;
        quick: boolean;
      }>
    >("/internal/meals/list", { from: date, to: date }, token),
  ]);

  const members = new Map((agenda?.snapshot?.members ?? []).map((member) => [member.id, member.name]));
  const events: CalendarEvent[] = (agenda?.snapshot?.occurrences ?? [])
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
    startsAt: civilInstant(meal.date, MEAL_TIMES[meal.mealType] ?? "12:30"),
    mealType: meal.mealType,
    quick: meal.quick,
    prepMinutes: meal.prepMinutes,
  }));

  return { date, events, meals: planned };
}

export async function loadWeekRange() {
  const today = civilToday();
  return { today, from: today, to: addCivilDays(today, 13) };
}
