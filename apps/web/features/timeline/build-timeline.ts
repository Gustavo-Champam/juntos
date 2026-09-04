import type { BuildTimelineInput, TimelineItem } from "./types";

function happensOnDate(startsAt: string, date: string): boolean {
  return startsAt.startsWith(`${date}T`);
}

export function buildTimeline({
  date,
  events,
  meals,
}: BuildTimelineInput): TimelineItem[] {
  const itemsWithOrder = [
    ...events
      .filter((event) => happensOnDate(event.startsAt, date))
      .map((event, inputOrder) => ({
        item: { ...event, kind: "event" as const },
        inputOrder,
      })),
    ...meals
      .filter((meal) => happensOnDate(meal.startsAt, date))
      .map((meal, mealOrder) => ({
        item: { ...meal, kind: "meal" as const },
        inputOrder: events.length + mealOrder,
      })),
  ];

  return itemsWithOrder
    .sort(
      (left, right) =>
        left.item.startsAt.localeCompare(right.item.startsAt) ||
        left.inputOrder - right.inputOrder,
    )
    .map(({ item }) => item);
}
