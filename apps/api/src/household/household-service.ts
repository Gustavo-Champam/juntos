import { randomUUID } from "node:crypto";

import { addCivilDays, parseCivilDate } from "@juntos/contracts";

import type { Database } from "../db/pool.js";
import { SharedDataError, withMemberTransaction } from "../spaces/member-transaction.js";
import { omniChat } from "./omniroute.js";
import { foldName, suggestRecipesForItems, type RecipeSuggestion } from "./recipe-suggest.js";
import {
  formatQuantity,
  getRecipe,
  ingredientKey,
  MEAL_LABELS,
  RECIPES,
  type Recipe,
} from "./recipes.js";
import type { IngredientCategory, MealType } from "./types.js";

export class HouseholdInputError extends Error {
  constructor(message = "invalid_household_input") {
    super(message);
    this.name = "HouseholdInputError";
  }
}

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

type MealRow = {
  id: string;
  date: Date | string;
  meal_type: MealType;
  recipe_id: string | null;
  title: string;
  prep_minutes: number;
  quick: boolean;
};

type ItemRow = {
  id: string;
  name: string;
  quantity: string;
  category: IngredientCategory;
  note: string;
  source: "auto" | "manual";
  ingredient_key: string | null;
  checked: boolean;
};

const globalRate = globalThis as typeof globalThis & {
  __juntosAiStamp__?: Map<string, number>;
};

function civil(value: Date | string): string {
  if (typeof value === "string") return parseCivilDate(value.slice(0, 10));
  const year = value.getFullYear().toString().padStart(4, "0");
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return parseCivilDate(`${year}-${month}-${day}`);
}

function mapMeal(row: MealRow): PlannedMeal {
  return {
    id: row.id,
    date: civil(row.date),
    mealType: row.meal_type,
    recipeId: row.recipe_id,
    title: row.title,
    prepMinutes: Number(row.prep_minutes),
    quick: Boolean(row.quick),
  };
}

function mapItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    note: row.note,
    source: row.source,
    checked: Boolean(row.checked),
  };
}

async function rebuildShopping(
  client: { query: Database["query"] },
  spaceId: string,
  weekStart: string,
) {
  const weekEnd = addCivilDays(weekStart, 6);
  const meals = await client.query<{ recipe_id: string | null; title: string; meal_type: MealType }>(
    `SELECT recipe_id, title, meal_type FROM meal_plans
     WHERE space_id = $1 AND date >= $2 AND date <= $3`,
    [spaceId, weekStart, weekEnd],
  );

  const needed = new Map<
    string,
    { name: string; amount: number; unit: string; category: IngredientCategory; notes: Set<string> }
  >();

  for (const meal of meals.rows) {
    const recipe = getRecipe(meal.recipe_id);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient.name, ingredient.unit);
      const current = needed.get(key);
      if (current) {
        current.amount += ingredient.amount;
        current.notes.add(recipe.title);
      } else {
        needed.set(key, {
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          category: ingredient.category,
          notes: new Set([recipe.title]),
        });
      }
    }
  }

  const existing = await client.query<ItemRow>(
    `SELECT id, name, quantity, category, note, source, ingredient_key, checked
     FROM shopping_items WHERE space_id = $1 AND week_start = $2`,
    [spaceId, weekStart],
  );
  const byKey = new Map(
    existing.rows.filter((row) => row.ingredient_key).map((row) => [row.ingredient_key, row]),
  );

  for (const [key, item] of needed) {
    const quantity = formatQuantity(item.amount, item.unit);
    const note = [...item.notes].slice(0, 3).join(", ");
    const found = byKey.get(key);
    if (found) {
      if (!found.checked) {
        await client.query(
          `UPDATE shopping_items
           SET quantity = $1, note = $2, category = $3, source = 'auto', updated_at = now()
           WHERE id = $4`,
          [quantity, note, item.category, found.id],
        );
      }
      byKey.delete(key);
    } else {
      await client.query(
        `INSERT INTO shopping_items (
           id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto', $8, false, now())`,
        [randomUUID(), spaceId, weekStart, item.name, quantity, item.category, note, key],
      );
    }
  }

  for (const leftover of byKey.values()) {
    if (leftover.source === "auto" && !leftover.checked) {
      await client.query(`DELETE FROM shopping_items WHERE id = $1`, [leftover.id]);
    }
  }
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

export class HouseholdService {
  constructor(private readonly database: Database) {}

  async listMeals(userId: string, from: string, to: string): Promise<PlannedMeal[]> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const result = await client.query<MealRow>(
        `SELECT id, date, meal_type, recipe_id, title, prep_minutes, quick
         FROM meal_plans
         WHERE space_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date, meal_type`,
        [spaceId, parseCivilDate(from), parseCivilDate(to)],
      );
      return result.rows.map(mapMeal);
    });
  }

  async saveMeal(
    userId: string,
    input: { date: string; mealType: MealType; recipeId?: string | null; title?: string; weekStart: string },
  ): Promise<PlannedMeal> {
    const recipe = getRecipe(input.recipeId);
    const title = recipe?.title ?? input.title?.trim() ?? "";
    if (!title) throw new HouseholdInputError("Escolha uma refeição.");
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const date = parseCivilDate(input.date);
      const weekStart = parseCivilDate(input.weekStart);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM meal_plans WHERE space_id = $1 AND date = $2 AND meal_type = $3`,
        [spaceId, date, input.mealType],
      );
      const id = existing.rows[0]?.id ?? randomUUID();
      const prep = recipe?.prepMinutes ?? 20;
      const quick = recipe?.quick ?? prep <= 20;
      if (existing.rows[0]) {
        await client.query(
          `UPDATE meal_plans
           SET recipe_id = $1, title = $2, prep_minutes = $3, quick = $4, updated_by = $5, updated_at = now()
           WHERE id = $6`,
          [recipe?.id ?? null, title.slice(0, 120), prep, quick, userId, id],
        );
      } else {
        await client.query(
          `INSERT INTO meal_plans (
             id, space_id, date, meal_type, recipe_id, title, prep_minutes, quick, updated_by, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
          [id, spaceId, date, input.mealType, recipe?.id ?? null, title.slice(0, 120), prep, quick, userId],
        );
      }
      await rebuildShopping(client, spaceId, weekStart);
      const saved = await client.query<MealRow>(
        `SELECT id, date, meal_type, recipe_id, title, prep_minutes, quick FROM meal_plans WHERE id = $1`,
        [id],
      );
      return mapMeal(saved.rows[0]!);
    });
  }

  async clearMeal(userId: string, input: { date: string; mealType: MealType; weekStart: string }) {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      await client.query(
        `DELETE FROM meal_plans WHERE space_id = $1 AND date = $2 AND meal_type = $3`,
        [spaceId, parseCivilDate(input.date), input.mealType],
      );
      await rebuildShopping(client, spaceId, parseCivilDate(input.weekStart));
      return { ok: true as const };
    });
  }

  async listShopping(userId: string, weekStartRaw: string): Promise<ShoppingItem[]> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const weekStart = parseCivilDate(weekStartRaw);
      await rebuildShopping(client, spaceId, weekStart);
      const result = await client.query<ItemRow>(
        `SELECT id, name, quantity, category, note, source, ingredient_key, checked
         FROM shopping_items WHERE space_id = $1 AND week_start = $2
         ORDER BY category, name`,
        [spaceId, weekStart],
      );
      return result.rows.map(mapItem);
    });
  }

  async addShoppingItem(
    userId: string,
    input: { weekStart: string; name: string; quantity: string; category: IngredientCategory },
  ): Promise<ShoppingItem> {
    const name = input.name.trim();
    if (!name) throw new HouseholdInputError("Diga o que vocês precisam comprar.");
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO shopping_items (
           id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked, updated_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'item avulso', 'manual', null, false, $7, now())`,
        [
          id,
          spaceId,
          parseCivilDate(input.weekStart),
          name.slice(0, 80),
          input.quantity.trim().slice(0, 40),
          input.category,
          userId,
        ],
      );
      const rows = await client.query<ItemRow>(
        `SELECT id, name, quantity, category, note, source, ingredient_key, checked FROM shopping_items WHERE id = $1`,
        [id],
      );
      return mapItem(rows.rows[0]!);
    });
  }

  async toggleShoppingItem(userId: string, input: { id: string; checked: boolean }): Promise<ShoppingItem> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const rows = await client.query<ItemRow>(
        `UPDATE shopping_items
         SET checked = $1, updated_by = $2, updated_at = now()
         WHERE id = $3 AND space_id = $4
         RETURNING id, name, quantity, category, note, source, ingredient_key, checked`,
        [input.checked, userId, input.id, spaceId],
      );
      if (!rows.rows[0]) throw new SharedDataError(404);
      return mapItem(rows.rows[0]);
    });
  }

  async removeShoppingItem(userId: string, id: string) {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      await client.query(
        `DELETE FROM shopping_items WHERE id = $1 AND space_id = $2 AND source = 'manual'`,
        [id, spaceId],
      );
      return { ok: true as const };
    });
  }

  async addRecipeIngredients(userId: string, input: { weekStart: string; recipeId: string }) {
    const recipe = getRecipe(input.recipeId);
    if (!recipe) throw new SharedDataError(404);
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const weekStart = parseCivilDate(input.weekStart);
      const existing = await client.query<{ name: string; ingredient_key: string | null }>(
        `SELECT name, ingredient_key FROM shopping_items WHERE space_id = $1 AND week_start = $2`,
        [spaceId, weekStart],
      );
      const owned = new Set(existing.rows.map((row) => foldName(row.name)));
      const keys = new Set(existing.rows.map((row) => row.ingredient_key).filter(Boolean));
      let added = 0;
      for (const ingredient of recipe.ingredients) {
        const key = ingredientKey(ingredient.name, ingredient.unit);
        if (owned.has(foldName(ingredient.name)) || keys.has(key)) continue;
        owned.add(foldName(ingredient.name));
        keys.add(key);
        await client.query(
          `INSERT INTO shopping_items (
             id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked, updated_by, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, false, $9, now())`,
          [
            randomUUID(),
            spaceId,
            weekStart,
            ingredient.name,
            formatQuantity(ingredient.amount, ingredient.unit),
            ingredient.category,
            recipe.title,
            key,
            userId,
          ],
        );
        added += 1;
      }
      return { ok: true as const, added };
    });
  }

  async suggestRecipes(
    userId: string,
    input: { weekStart: string; mealType?: MealType; maxMinutes?: number },
  ): Promise<RecipeSuggestion[]> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const weekStart = parseCivilDate(input.weekStart);
      const weekEnd = addCivilDays(weekStart, 6);
      const [items, meals] = await Promise.all([
        client.query<{ name: string }>(
          `SELECT name FROM shopping_items WHERE space_id = $1 AND week_start = $2`,
          [spaceId, weekStart],
        ),
        client.query<{ recipe_id: string | null }>(
          `SELECT recipe_id FROM meal_plans WHERE space_id = $1 AND date >= $2 AND date <= $3`,
          [spaceId, weekStart, weekEnd],
        ),
      ]);
      return suggestRecipesForItems({
        itemNames: items.rows.map((item) => item.name),
        plannedRecipeIds: meals.rows.map((meal) => meal.recipe_id).filter((id): id is string => Boolean(id)),
        ...(input.mealType ? { mealType: input.mealType } : {}),
        ...(input.maxMinutes ? { maxMinutes: input.maxMinutes } : {}),
      });
    });
  }

  async catalog(mealType?: MealType): Promise<Recipe[]> {
    return mealType ? RECIPES.filter((recipe) => recipe.mealType === mealType) : RECIPES;
  }

  async askAi(
    userId: string,
    input: { weekStart: string; note?: string },
  ): Promise<{ ok: true; suggestions: RecipeSuggestion[] } | { ok: false; error: string }> {
    const now = Date.now();
    globalRate.__juntosAiStamp__ ??= new Map();
    const previous = globalRate.__juntosAiStamp__.get(userId) ?? 0;
    if (now - previous < 12_000) {
      return { ok: false, error: "Esperem alguns segundos antes de pedir de novo." };
    }
    globalRate.__juntosAiStamp__.set(userId, now);

    const weekStart = parseCivilDate(input.weekStart);
    const weekEnd = addCivilDays(weekStart, 6);
    const { items, meals } = await withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const [itemRows, mealRows] = await Promise.all([
        client.query<{ name: string; quantity: string }>(
          `SELECT name, quantity FROM shopping_items WHERE space_id = $1 AND week_start = $2`,
          [spaceId, weekStart],
        ),
        client.query<{ recipe_id: string | null; title: string; meal_type: MealType }>(
          `SELECT recipe_id, title, meal_type FROM meal_plans WHERE space_id = $1 AND date >= $2 AND date <= $3`,
          [spaceId, weekStart, weekEnd],
        ),
      ]);
      return { items: itemRows.rows, meals: mealRows.rows };
    });

    const catalog = RECIPES.map(
      (recipe) =>
        `${recipe.id} | ${recipe.title} | ${MEAL_LABELS[recipe.mealType]} | ${recipe.prepMinutes} min | ${recipe.ingredients.map((ing) => ing.name).join(", ")}`,
    ).join("\n");
    const listText = items.length > 0 ? items.map((item) => `${item.name} (${item.quantity})`).join("; ") : "lista vazia";
    const menuText =
      meals.length > 0 ? meals.map((meal) => `${MEAL_LABELS[meal.meal_type]}: ${meal.title}`).join("; ") : "nenhuma refeição combinada";
    const note = input.note?.trim().slice(0, 180) ?? "";

    const result = await omniChat({
      maxTokens: 420,
      messages: [
        {
          role: "system",
          content:
            'Você monta o cardápio de um casal no Brasil. Responda só um JSON array, sem markdown. Cada item: {"id":"...","reason":"frase curta"}. Use apenas ids do catálogo. No máximo 5. Prefira reaproveitar a lista de compras e não repetir o que já está no cardápio.',
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
  }
}
