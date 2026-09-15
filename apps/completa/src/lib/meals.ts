import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { addCivilDays, parseCivilDate } from "./civil";
import { getRecipe, RECIPES } from "./recipes";
import { rebuildShopping } from "./shopping-rebuild";
import { requireSpace } from "./space";
import type { MealType, PlannedMeal } from "./types";

type MealRow = {
  id: string;
  date: string;
  meal_type: MealType;
  recipe_id: string | null;
  title: string;
  prep_minutes: number;
  quick: boolean;
};

function asBool(value: boolean | string | number): boolean {
  return value === true || value === "t" || value === 1 || value === "1";
}

function mapMeal(row: MealRow): PlannedMeal {
  return {
    id: row.id,
    date: row.date,
    mealType: row.meal_type,
    recipeId: row.recipe_id,
    title: row.title,
    prepMinutes: Number(row.prep_minutes),
    quick: asBool(row.quick),
  };
}

export const listMeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ context, data }) => {
    const from = parseCivilDate(data.from);
    const to = parseCivilDate(data.to);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const rows = await sql<MealRow>`
      select id, date::text as date, meal_type, recipe_id, title, prep_minutes, quick
      from meal_plans
      where space_id = ${space.id} and date >= ${from} and date <= ${to}
      order by date, meal_type
    `;
    return rows.map(mapMeal);
  });

export const saveMeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      date: string;
      mealType: MealType;
      recipeId?: string | null;
      title?: string;
      weekStart: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const date = parseCivilDate(data.date);
    const weekStart = parseCivilDate(data.weekStart);
    const recipe = getRecipe(data.recipeId);
    const title = recipe?.title ?? data.title?.trim() ?? "";
    if (!title) throw new Error("Escolha uma refeição.");
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const existing = await sql<{ id: string }>`
      select id from meal_plans
      where space_id = ${space.id} and date = ${date} and meal_type = ${data.mealType}
      limit 1
    `;
    const id = existing[0]?.id ?? crypto.randomUUID();
    const prep = recipe?.prepMinutes ?? 20;
    const quick = recipe?.quick ?? prep <= 20;
    if (existing[0]) {
      await sql`
        update meal_plans
        set recipe_id = ${recipe?.id ?? null},
            title = ${title.slice(0, 120)},
            prep_minutes = ${prep},
            quick = ${quick},
            updated_by = ${context.userId},
            updated_at = now()
        where id = ${id} and space_id = ${space.id}
      `;
    } else {
      await sql`
        insert into meal_plans (
          id, space_id, date, meal_type, recipe_id, title, prep_minutes, quick, updated_by
        ) values (
          ${id}, ${space.id}, ${date}, ${data.mealType}, ${recipe?.id ?? null},
          ${title.slice(0, 120)}, ${prep}, ${quick}, ${context.userId}
        )
      `;
    }
    await rebuildShopping(sql, space.id, weekStart);
    const saved = await sql<MealRow>`
      select id, date::text as date, meal_type, recipe_id, title, prep_minutes, quick
      from meal_plans where id = ${id}
    `;
    return mapMeal(saved[0]!);
  });

export const clearMeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { date: string; mealType: MealType; weekStart: string }) => input)
  .handler(async ({ context, data }) => {
    const date = parseCivilDate(data.date);
    const weekStart = parseCivilDate(data.weekStart);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    await sql`
      delete from meal_plans
      where space_id = ${space.id} and date = ${date} and meal_type = ${data.mealType}
    `;
    await rebuildShopping(sql, space.id, weekStart);
    return { ok: true as const };
  });

export const suggestMeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { mealType: MealType; maxMinutes?: number; weekStart: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const from = parseCivilDate(data.weekStart);
    const to = addCivilDays(from, 20);
    const recent = await sql<{ recipe_id: string | null }>`
      select recipe_id from meal_plans
      where space_id = ${space.id} and date >= ${from} and date <= ${to}
    `;
    const used = new Set(recent.map((row) => row.recipe_id).filter(Boolean));
    return RECIPES.filter((recipe) => {
      if (recipe.mealType !== data.mealType) return false;
      if (data.maxMinutes && recipe.prepMinutes > data.maxMinutes) return false;
      return true;
    }).sort((left, right) => {
      const leftUsed = used.has(left.id) ? 1 : 0;
      const rightUsed = used.has(right.id) ? 1 : 0;
      return leftUsed - rightUsed || left.prepMinutes - right.prepMinutes;
    });
  });
