export type MealType = "breakfast" | "lunch" | "dinner";

export type IngredientCategory =
  | "hortifruti"
  | "mercearia"
  | "carnes"
  | "laticinios"
  | "outros";

export type SpaceMember = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

export type CoupleSpace = {
  id: string;
  name: string;
  memberCount: 1 | 2;
  members: SpaceMember[];
};

export type Bootstrap = {
  user: SpaceMember;
  space: CoupleSpace | null;
};

export type AgendaFields = {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string;
  notes: string;
  assigneeId: string | null;
  weekly: boolean;
  recurrenceUntil: string | null;
};

export type AgendaEvent = AgendaFields & {
  id: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
};

export type AgendaOccurrence = {
  occurrenceId: string;
  eventId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  event: AgendaEvent;
};

export type PlannedMeal = {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  title: string;
  prepMinutes: number;
  quick: boolean;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  category: IngredientCategory;
  note: string;
  source: "auto" | "manual";
  checked: boolean;
};
