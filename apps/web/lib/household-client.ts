async function post<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/household", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...body }),
  });
  if (!response.ok) {
    throw new Error("request_failed");
  }
  return (await response.json()) as T;
}

export const household = {
  meals: (from: string, to: string) => post("meals.list", { from, to }),
  saveMeal: (body: Record<string, unknown>) => post("meals.save", body),
  clearMeal: (body: Record<string, unknown>) => post("meals.clear", body),
  shopping: (weekStart: string) => post("shopping.list", { weekStart }),
  addItem: (body: Record<string, unknown>) => post("shopping.add", body),
  toggleItem: (id: string, checked: boolean) => post("shopping.toggle", { id, checked }),
  removeItem: (id: string) => post("shopping.remove", { id }),
  fromRecipe: (weekStart: string, recipeId: string) => post("shopping.fromRecipe", { weekStart, recipeId }),
  suggest: (weekStart: string) => post("recipes.suggest", { weekStart }),
  ai: (weekStart: string, note?: string) => post("recipes.ai", { weekStart, note }),
  catalog: (mealType?: string) => post("recipes.catalog", mealType ? { mealType } : {}),
  agenda: (from: string, to: string) => post("agenda.list", { from, to }),
  createAgenda: (event: Record<string, unknown>) => post("agenda.create", { event }),
  deleteAgenda: (id: string, expectedVersion: number) =>
    post("agenda.delete", { id, expectedVersion, confirmed: true }),
};
