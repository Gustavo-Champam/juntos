export type CoupleMember = string;

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  owner: CoupleMember;
  location?: string;
};

export type MealType = "breakfast" | "lunch" | "dinner";

export type PlannedMeal = {
  id: string;
  title: string;
  startsAt: string;
  mealType: MealType;
  quick: boolean;
  prepMinutes?: number;
};

export type TimelineItem =
  | ({ kind: "event" } & CalendarEvent)
  | ({ kind: "meal" } & PlannedMeal);

export type BuildTimelineInput = {
  date: string;
  events: readonly CalendarEvent[];
  meals: readonly PlannedMeal[];
};
