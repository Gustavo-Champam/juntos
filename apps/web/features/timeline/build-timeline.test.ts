import { describe, expect, it } from "vitest";

import { buildTimeline } from "./build-timeline";
import type { CalendarEvent, PlannedMeal } from "./types";

const events: CalendarEvent[] = [
  {
    id: "event-college",
    title: "Faculdade",
    startsAt: "2026-09-04T19:00:00-03:00",
    endsAt: "2026-09-04T22:30:00-03:00",
    owner: "Gustavo",
  },
  {
    id: "event-work",
    title: "Reunião do trabalho",
    startsAt: "2026-09-04T09:00:00-03:00",
    endsAt: "2026-09-04T10:00:00-03:00",
    owner: "Amor",
  },
  {
    id: "event-tomorrow",
    title: "Dentista",
    startsAt: "2026-09-05T08:00:00-03:00",
    endsAt: "2026-09-05T09:00:00-03:00",
    owner: "Gustavo",
  },
];

const meals: PlannedMeal[] = [
  {
    id: "meal-dinner",
    title: "Wrap de frango e salada",
    startsAt: "2026-09-04T18:00:00-03:00",
    mealType: "dinner",
    quick: true,
  },
  {
    id: "meal-breakfast",
    title: "Iogurte, fruta e granola",
    startsAt: "2026-09-04T07:15:00-03:00",
    mealType: "breakfast",
    quick: true,
  },
  {
    id: "meal-lunch",
    title: "Arroz, feijão e frango grelhado",
    startsAt: "2026-09-04T12:30:00-03:00",
    mealType: "lunch",
    quick: false,
  },
];

describe("buildTimeline", () => {
  it("merges and sorts the selected day's commitments and meals", () => {
    const result = buildTimeline({ date: "2026-09-04", events, meals });

    expect(result.map((item) => item.id)).toEqual([
      "meal-breakfast",
      "event-work",
      "meal-lunch",
      "meal-dinner",
      "event-college",
    ]);
  });

  it("keeps source-specific information for presentation", () => {
    const result = buildTimeline({ date: "2026-09-04", events, meals });

    expect(result[0]).toMatchObject({
      kind: "meal",
      mealType: "breakfast",
      quick: true,
    });
    expect(result.at(-1)).toMatchObject({
      kind: "event",
      owner: "Gustavo",
    });
  });

  it("uses input order as a deterministic tie breaker without mutating inputs", () => {
    const tiedEvents: CalendarEvent[] = [
      { ...events[0], id: "event-first", startsAt: "2026-09-04T18:00:00-03:00" },
      { ...events[1], id: "event-second", startsAt: "2026-09-04T18:00:00-03:00" },
    ];
    const originalEvents = structuredClone(tiedEvents);
    const originalMeals = structuredClone(meals);

    const result = buildTimeline({
      date: "2026-09-04",
      events: tiedEvents,
      meals,
    });

    expect(
      result
        .filter((item) => item.startsAt.includes("T18:00"))
        .map((item) => item.id),
    ).toEqual(["event-first", "event-second", "meal-dinner"]);
    expect(tiedEvents).toEqual(originalEvents);
    expect(meals).toEqual(originalMeals);
  });
});
