"use client";

import { Clock3, CookingPot, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/dates";
import { household } from "@/lib/household-client";
import { MEAL_SHORT, type Recipe } from "@/lib/recipes";
import type { MealType } from "@/lib/household-types";

type PlannedMeal = {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  title: string;
  prepMinutes: number;
  quick: boolean;
};

const SLOTS: MealType[] = ["breakfast", "lunch", "dinner"];

export function MealsPlanner() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [catalog, setCatalog] = useState<Recipe[]>([]);
  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null);
  const [error, setError] = useState("");
  const weekEnd = addCivilDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index)), [weekStart]);

  const load = useCallback(async () => {
    try {
      const data = await household.meals(weekStart, weekEnd);
      setMeals(data as PlannedMeal[]);
      setError("");
    } catch {
      setError("Não foi possível carregar o cardápio.");
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void household.catalog().then((data) => setCatalog(data as Recipe[])).catch(() => undefined);
  }, []);

  const bySlot = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    for (const meal of meals) map.set(`${meal.date}:${meal.mealType}`, meal);
    return map;
  }, [meals]);

  async function choose(recipe: Recipe) {
    if (!picking) return;
    try {
      await household.saveMeal({
        date: picking.date,
        mealType: picking.mealType,
        recipeId: recipe.id,
        weekStart,
      });
      setPicking(null);
      await load();
    } catch {
      setError("Não deu para salvar essa refeição.");
    }
  }

  async function clear(date: string, mealType: MealType) {
    try {
      await household.clearMeal({ date, mealType, weekStart });
      await load();
    } catch {
      setError("Não deu para limpar essa refeição.");
    }
  }

  const pickerRecipes = picking ? catalog.filter((recipe) => recipe.mealType === picking.mealType) : [];

  return (
    <section className="collection-view collection-view--wide" aria-labelledby="meals-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Planejamento leve</p>
          <h1 id="meals-title">Cardápio da semana</h1>
          <p>Escolham receitas. A lista de compras se monta sozinha.</p>
        </div>
        <span className="collection-count">
          <CookingPot size={16} aria-hidden="true" />
          {meals.length} refeições combinadas
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls" aria-label="Semana">
          <button type="button" onClick={() => setWeekStart((date) => addCivilDays(date, -7))}>‹</button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(today))}>Esta semana</button>
          <button type="button" onClick={() => setWeekStart((date) => addCivilDays(date, 7))}>›</button>
        </div>
        <p className="toolbar-label">
          {formatDayMonth(weekStart)} — {formatDayMonth(weekEnd)}
        </p>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      <ul className="meal-week" aria-label="Refeições da semana">
        {days.map((date) => (
          <li className="meal-day" key={date}>
            <div className="meal-day-label">
              <strong>{formatWeekdayShort(date)}</strong>
              <span>{formatDayMonth(date)}</span>
            </div>
            {SLOTS.map((mealType) => {
              const meal = bySlot.get(`${date}:${mealType}`);
              return (
                <div className="meal-slot" key={mealType}>
                  <span className="meal-label">{MEAL_SHORT[mealType]}</span>
                  {meal ? (
                    <>
                      <strong>{meal.title}</strong>
                      {meal.quick ? (
                        <small>
                          <Clock3 size={12} aria-hidden="true" /> Rápida · {meal.prepMinutes} min
                        </small>
                      ) : (
                        <small>{meal.prepMinutes} min</small>
                      )}
                      <button type="button" className="quiet-button" onClick={() => void clear(date, mealType)}>
                        Limpar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="quiet-button" onClick={() => setPicking({ date, mealType })}>
                      Escolher
                    </button>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>

      {picking ? (
        <div className="picker-sheet" role="dialog" aria-label="Escolher receita">
          <header className="collection-heading">
            <div>
              <p className="eyebrow">{MEAL_SHORT[picking.mealType]} · {formatWeekdayShort(picking.date)}</p>
              <h2>Receitas</h2>
            </div>
            <button type="button" className="quiet-button" onClick={() => setPicking(null)}>
              <X size={16} aria-hidden="true" /> Fechar
            </button>
          </header>
          <ul className="suggestion-grid">
            {pickerRecipes.map((recipe) => (
              <li key={recipe.id}>
                <button type="button" className="suggestion-card" onClick={() => void choose(recipe)}>
                  <p className="eyebrow">{recipe.quick ? "Rápida" : `${recipe.prepMinutes} min`}</p>
                  <h3>{recipe.title}</h3>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
