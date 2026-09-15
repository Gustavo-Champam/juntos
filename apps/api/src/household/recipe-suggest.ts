import { MEAL_LABELS, RECIPES, type Recipe, type RecipeIngredient } from "./recipes.js";
import type { MealType } from "./types.js";

export type RecipeSuggestion = {
  id: string;
  title: string;
  mealType: MealType;
  mealLabel: string;
  prepMinutes: number;
  quick: boolean;
  servings: number;
  matchedCount: number;
  ingredientCount: number;
  missingNames: string[];
  matchedNames: string[];
  alreadyPlanned: boolean;
  overlapRatio: number;
  reason?: string;
};

export function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitOwned(recipe: Recipe, owned: Set<string>): {
  matched: string[];
  missing: RecipeIngredient[];
} {
  const matched: string[] = [];
  const missing: RecipeIngredient[] = [];
  for (const ingredient of recipe.ingredients) {
    if (owned.has(foldName(ingredient.name))) matched.push(ingredient.name);
    else missing.push(ingredient);
  }
  return { matched, missing };
}

export function suggestRecipesForItems(input: {
  itemNames: string[];
  plannedRecipeIds: string[];
  mealType?: MealType;
  maxMinutes?: number;
  limit?: number;
}): RecipeSuggestion[] {
  const owned = new Set(input.itemNames.map(foldName).filter(Boolean));
  const planned = new Set(input.plannedRecipeIds.filter(Boolean));
  const hasList = owned.size > 0;
  const limit = input.limit ?? 6;

  const scored = RECIPES.filter((recipe) => {
    if (input.mealType && recipe.mealType !== input.mealType) return false;
    if (input.maxMinutes && recipe.prepMinutes > input.maxMinutes) return false;
    return !planned.has(recipe.id);
  }).map((recipe) => {
    const { matched, missing } = splitOwned(recipe, owned);
    const overlapRatio = recipe.ingredients.length ? matched.length / recipe.ingredients.length : 0;
    return { recipe, matched, missing, overlapRatio };
  });

  scored.sort((left, right) => {
    if (hasList) {
      if (right.overlapRatio !== left.overlapRatio) return right.overlapRatio - left.overlapRatio;
      if (left.missing.length !== right.missing.length) return left.missing.length - right.missing.length;
    } else if (left.recipe.quick !== right.recipe.quick) {
      return left.recipe.quick ? -1 : 1;
    }
    if (left.recipe.prepMinutes !== right.recipe.prepMinutes) {
      return left.recipe.prepMinutes - right.recipe.prepMinutes;
    }
    return left.recipe.title.localeCompare(right.recipe.title, "pt-BR");
  });

  const withMatch = hasList ? scored.filter((entry) => entry.matched.length > 0) : scored;
  const picked: typeof scored = [];

  if (!hasList && !input.mealType) {
    const types: MealType[] = ["breakfast", "lunch", "dinner"];
    for (const type of types) {
      picked.push(...scored.filter((entry) => entry.recipe.mealType === type).slice(0, 2));
    }
  } else {
    const reserved = hasList && !input.mealType ? 2 : 0;
    picked.push(...withMatch.slice(0, Math.max(limit - reserved, 1)));
    if (picked.length < limit) {
      const used = new Set(picked.map((entry) => entry.recipe.id));
      const represented = new Set(picked.map((entry) => entry.recipe.mealType));
      const rest = scored.filter((entry) => !used.has(entry.recipe.id));
      for (const type of ["breakfast", "lunch", "dinner"] as MealType[]) {
        if (represented.has(type) || picked.length >= limit) continue;
        const next = rest.find((entry) => entry.recipe.mealType === type);
        if (next) {
          picked.push(next);
          used.add(next.recipe.id);
        }
      }
      picked.push(
        ...rest.filter((entry) => !used.has(entry.recipe.id)).slice(0, limit - picked.length),
      );
    }
  }

  return picked.slice(0, limit).map((entry) => ({
    id: entry.recipe.id,
    title: entry.recipe.title,
    mealType: entry.recipe.mealType,
    mealLabel: MEAL_LABELS[entry.recipe.mealType],
    prepMinutes: entry.recipe.prepMinutes,
    quick: entry.recipe.quick,
    servings: entry.recipe.servings,
    matchedCount: entry.matched.length,
    ingredientCount: entry.recipe.ingredients.length,
    missingNames: entry.missing.map((ingredient) => ingredient.name),
    matchedNames: entry.matched,
    alreadyPlanned: false,
    overlapRatio: entry.overlapRatio,
  }));
}
