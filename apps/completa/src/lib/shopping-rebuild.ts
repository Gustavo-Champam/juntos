import type { Sql } from "@/lib/db";
import { addCivilDays } from "./civil";
import { formatQuantity, getRecipe, ingredientKey } from "./recipes";
import type { IngredientCategory, MealType } from "./types";

type MealRow = {
  recipe_id: string | null;
  title: string;
  meal_type: MealType;
};

type ItemRow = {
  id: string;
  ingredient_key: string | null;
  source: string;
  checked: boolean;
};

export async function rebuildShopping(sql: Sql, spaceId: string, weekStart: string) {
  const weekEnd = addCivilDays(weekStart, 6);
  const meals = await sql<MealRow>`
    select recipe_id, title, meal_type
    from meal_plans
    where space_id = ${spaceId} and date >= ${weekStart} and date <= ${weekEnd}
  `;

  const needed = new Map<
    string,
    { name: string; amount: number; unit: string; category: IngredientCategory; notes: Set<string> }
  >();

  for (const meal of meals) {
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

  const existing = await sql<ItemRow>`
    select id, ingredient_key, source, checked
    from shopping_items
    where space_id = ${spaceId} and week_start = ${weekStart}
  `;

  const byKey = new Map(existing.filter((row) => row.ingredient_key).map((row) => [row.ingredient_key, row]));

  for (const [key, item] of needed) {
    const quantity = formatQuantity(item.amount, item.unit);
    const note = [...item.notes].slice(0, 3).join(", ");
    const found = byKey.get(key);
    if (found) {
      if (!found.checked) {
        await sql`
          update shopping_items
          set quantity = ${quantity}, note = ${note}, category = ${item.category}, source = ${"auto"}, updated_at = now()
          where id = ${found.id}
        `;
      }
      byKey.delete(key);
    } else {
      await sql`
        insert into shopping_items (
          id, space_id, week_start, name, quantity, category, note, source, ingredient_key, checked
        ) values (
          ${crypto.randomUUID()}, ${spaceId}, ${weekStart}, ${item.name}, ${quantity},
          ${item.category}, ${note}, ${"auto"}, ${key}, false
        )
      `;
    }
  }

  for (const leftover of byKey.values()) {
    if (leftover.source === "auto" && !leftover.checked) {
      await sql`delete from shopping_items where id = ${leftover.id}`;
    }
  }
}
