import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { addCivilDays, parseCivilDate } from "./civil";
import { omniChat } from "./omniroute";
import { getRecipe, MEAL_LABELS, RECIPES } from "./recipes";
import { foldName, suggestRecipesForItems, type RecipeSuggestion } from "./recipe-suggest";
import { requireSpace } from "./space";
import type { MealType } from "./types";

const globalRate = globalThis as typeof globalThis & {
  __juntosAiStamp__?: Map<string, number>;
};

function rateMap(): Map<string, number> {
  globalRate.__juntosAiStamp__ ??= new Map();
  return globalRate.__juntosAiStamp__;
}

function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const askAiRecipes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weekStart: string; note?: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; suggestions: RecipeSuggestion[] } | { ok: false; error: string }> => {
    const now = Date.now();
    const stamps = rateMap();
    const previous = stamps.get(context.userId) ?? 0;
    if (now - previous < 12_000) {
      return { ok: false, error: "Esperem alguns segundos antes de pedir de novo." };
    }
    stamps.set(context.userId, now);

    const weekStart = parseCivilDate(data.weekStart);
    const weekEnd = addCivilDays(weekStart, 6);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const [items, meals] = await Promise.all([
      sql<{ name: string; quantity: string }>`
        select name, quantity from shopping_items
        where space_id = ${space.id} and week_start = ${weekStart}
      `,
      sql<{ recipe_id: string | null; title: string; meal_type: MealType }>`
        select recipe_id, title, meal_type from meal_plans
        where space_id = ${space.id} and date >= ${weekStart} and date <= ${weekEnd}
      `,
    ]);

    const catalog = RECIPES.map(
      (recipe) =>
        `${recipe.id} | ${recipe.title} | ${MEAL_LABELS[recipe.mealType]} | ${recipe.prepMinutes} min | ${recipe.ingredients.map((ing) => ing.name).join(", ")}`,
    ).join("\n");

    const listText =
      items.length > 0
        ? items.map((item) => `${item.name} (${item.quantity})`).join("; ")
        : "lista vazia";
    const menuText =
      meals.length > 0
        ? meals.map((meal) => `${MEAL_LABELS[meal.meal_type]}: ${meal.title}`).join("; ")
        : "nenhuma refeição combinada";
    const note = data.note?.trim().slice(0, 180) ?? "";

    const result = await omniChat({
      maxTokens: 420,
      messages: [
        {
          role: "system",
          content:
            "Você monta o cardápio de um casal no Brasil. Responda só um JSON array, sem markdown. Cada item: {\"id\":\"...\",\"reason\":\"frase curta\"}. Use apenas ids do catálogo. No máximo 5. Prefira reaproveitar a lista de compras e não repetir o que já está no cardápio.",
        },
        {
          role: "user",
          content: `Catálogo:\n${catalog}\n\nLista de compras: ${listText}\nCardápio da semana: ${menuText}${note ? `\nPedido extra: ${note}` : ""}\n\nJSON:`,
        },
      ],
    });

    if (!result.ok) return result;

    const parsed = extractJsonArray(result.text);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "A IA não devolveu receitas neste formato. Tentem de novo." };
    }

    const owned = items.map((item) => foldName(item.name));
    const planned = meals.map((meal) => meal.recipe_id).filter((id): id is string => Boolean(id));
    const picked: RecipeSuggestion[] = [];
    const seen = new Set<string>();

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const id = "id" in row && typeof row.id === "string" ? row.id.trim() : "";
      const recipe = getRecipe(id);
      if (!recipe || seen.has(recipe.id) || planned.includes(recipe.id)) continue;
      seen.add(recipe.id);
      const matched = recipe.ingredients.filter((ing) => owned.includes(foldName(ing.name))).map((ing) => ing.name);
      const missing = recipe.ingredients.filter((ing) => !owned.includes(foldName(ing.name))).map((ing) => ing.name);
      const reason = "reason" in row && typeof row.reason === "string" ? row.reason.trim().slice(0, 140) : "";
      picked.push({
        id: recipe.id,
        title: recipe.title,
        mealType: recipe.mealType,
        mealLabel: MEAL_LABELS[recipe.mealType],
        prepMinutes: recipe.prepMinutes,
        quick: recipe.quick,
        servings: recipe.servings,
        matchedCount: matched.length,
        ingredientCount: recipe.ingredients.length,
        missingNames: missing,
        matchedNames: matched,
        alreadyPlanned: false,
        overlapRatio: recipe.ingredients.length ? matched.length / recipe.ingredients.length : 0,
        reason,
      });
      if (picked.length >= 5) break;
    }

    if (picked.length === 0) {
      return {
        ok: true,
        suggestions: suggestRecipesForItems({
          itemNames: items.map((item) => item.name),
          plannedRecipeIds: planned,
        }),
      };
    }

    return { ok: true, suggestions: picked };
  });
