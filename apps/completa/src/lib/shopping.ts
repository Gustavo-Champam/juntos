import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { addCivilDays, parseCivilDate } from "./civil";
import { foldName, suggestRecipesForItems } from "./recipe-suggest";
import { formatQuantity, getRecipe, ingredientKey } from "./recipes";
import { rebuildShopping } from "./shopping-rebuild";
import { requireSpace } from "./space";
import type { IngredientCategory, MealType, ShoppingItem } from "./types";

type ItemRow = {
  id: string;
  name: string;
  quantity: string;
  category: IngredientCategory;
  note: string;
  source: "auto" | "manual";
  checked: boolean;
};

function asBool(value: boolean | string | number): boolean {
  return value === true || value === "t" || value === 1 || value === "1";
}

function mapItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    note: row.note,
    source: row.source,
    checked: asBool(row.checked),
  };
}

export const listShopping = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { weekStart: string }) => input)
  .handler(async ({ context, data }) => {
    const weekStart = parseCivilDate(data.weekStart);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    await rebuildShopping(sql, space.id, weekStart);
    const rows = await sql<ItemRow>`
      select id, name, quantity, category, note, source, checked
      from shopping_items
      where space_id = ${space.id} and week_start = ${weekStart}
      order by category, name
    `;
    return rows.map(mapItem);
  });

export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; checked: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const rows = await sql<ItemRow>`
      update shopping_items
      set checked = ${data.checked}, updated_by = ${context.userId}, updated_at = now()
      where id = ${data.id} and space_id = ${space.id}
      returning id, name, quantity, category, note, source, checked
    `;
    if (!rows[0]) throw new Error("Item não encontrado.");
    return mapItem(rows[0]);
  });

export const addShoppingItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weekStart: string; name: string; quantity: string; category: IngredientCategory }) => input)
  .handler(async ({ context, data }) => {
    const name = data.name.trim();
    if (!name) throw new Error("Diga o que vocês precisam comprar.");
    const weekStart = parseCivilDate(data.weekStart);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const id = crypto.randomUUID();
    await sql`
      insert into shopping_items (
        id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked, updated_by
      ) values (
        ${id}, ${space.id}, ${weekStart}, ${name.slice(0, 80)}, ${data.quantity.trim().slice(0, 40)},
        ${data.category}, ${"item avulso"}, ${"manual"}, null, false, ${context.userId}
      )
    `;
    const rows = await sql<ItemRow>`
      select id, name, quantity, category, note, source, checked
      from shopping_items where id = ${id}
    `;
    return mapItem(rows[0]!);
  });

export const removeShoppingItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    await sql`
      delete from shopping_items
      where id = ${data.id} and space_id = ${space.id} and source = 'manual'
    `;
    return { ok: true as const };
  });

export const suggestRecipesForList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { weekStart: string; mealType?: MealType; maxMinutes?: number }) => input)
  .handler(async ({ context, data }) => {
    const weekStart = parseCivilDate(data.weekStart);
    const weekEnd = addCivilDays(weekStart, 6);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const [items, meals] = await Promise.all([
      sql<{ name: string }>`
        select name from shopping_items
        where space_id = ${space.id} and week_start = ${weekStart}
      `,
      sql<{ recipe_id: string | null }>`
        select recipe_id from meal_plans
        where space_id = ${space.id} and date >= ${weekStart} and date <= ${weekEnd}
      `,
    ]);
    return suggestRecipesForItems({
      itemNames: items.map((item) => item.name),
      plannedRecipeIds: meals.map((meal) => meal.recipe_id).filter((id): id is string => Boolean(id)),
      mealType: data.mealType,
      maxMinutes: data.maxMinutes,
    });
  });

export const addRecipeIngredients = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weekStart: string; recipeId: string }) => input)
  .handler(async ({ context, data }) => {
    const recipe = getRecipe(data.recipeId);
    if (!recipe) throw new Error("Receita não encontrada.");
    const weekStart = parseCivilDate(data.weekStart);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const existing = await sql<{ name: string; ingredient_key: string | null }>`
      select name, ingredient_key from shopping_items
      where space_id = ${space.id} and week_start = ${weekStart}
    `;
    const owned = new Set(existing.map((row) => foldName(row.name)));
    const keys = new Set(existing.map((row) => row.ingredient_key).filter((key): key is string => Boolean(key)));
    let added = 0;
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient.name, ingredient.unit);
      if (owned.has(foldName(ingredient.name)) || keys.has(key)) continue;
      owned.add(foldName(ingredient.name));
      keys.add(key);
      await sql`
        insert into shopping_items (
          id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked, updated_by
        ) values (
          ${crypto.randomUUID()}, ${space.id}, ${weekStart}, ${ingredient.name},
          ${formatQuantity(ingredient.amount, ingredient.unit)}, ${ingredient.category},
          ${recipe.title}, ${"manual"}, ${key}, false, ${context.userId}
        )
      `;
      added += 1;
    }
    return { ok: true as const, added };
  });
