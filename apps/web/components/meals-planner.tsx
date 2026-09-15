"use client";

import { Clock3, CookingPot, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/dates";
import { household } from "@/lib/household-client";
import { MEAL_LABELS, MEAL_SHORT, RECIPES, recipesFor, type Recipe } from "@/lib/recipes";
import { foldName, type RecipeSuggestion } from "@/lib/recipe-suggest";
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
  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null);
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const weekEnd = addCivilDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index)), [weekStart]);

  const load = useCallback(async () => {
    try {
      const data = await household.meals(weekStart, weekEnd);
      setMeals(Array.isArray(data) ? (data as PlannedMeal[]) : []);
      setError("");
    } catch {
      setError("Não foi possível carregar o cardápio.");
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const bySlot = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    for (const meal of meals) map.set(`${meal.date}:${meal.mealType}`, meal);
    return map;
  }, [meals]);

  async function saveRecipe(date: string, mealType: MealType, recipe: Recipe) {
    await household.saveMeal({ date, mealType, recipeId: recipe.id, weekStart });
    setPicking(null);
    await load();
  }

  async function saveCustom(date: string, mealType: MealType, title: string) {
    await household.saveMeal({ date, mealType, title, weekStart });
    setPicking(null);
    await load();
  }

  async function clear(date: string, mealType: MealType) {
    try {
      await household.clearMeal({ date, mealType, weekStart });
      await load();
    } catch {
      setError("Não deu para limpar essa refeição.");
    }
  }

  async function fillWeekWithAi() {
    setAiBusy(true);
    setError("");
    try {
      const result = (await household.ai(
        weekStart,
        "Monte o cardápio da semana: café, almoço e jantar, refeições brasileiras simples.",
      )) as { ok: boolean; suggestions?: RecipeSuggestion[]; error?: string };
      if (!result.ok || !result.suggestions?.length) {
        setError(result.error ?? "A IA não devolveu receitas. Escolham na lista.");
        return;
      }
      const used = new Set(meals.map((meal) => `${meal.date}:${meal.mealType}`));
      for (const suggestion of result.suggestions) {
        const recipe = RECIPES.find((item) => item.id === suggestion.id);
        if (!recipe) continue;
        const date = days.find((day) => !used.has(`${day}:${recipe.mealType}`));
        if (!date) continue;
        used.add(`${date}:${recipe.mealType}`);
        await household.saveMeal({ date, mealType: recipe.mealType, recipeId: recipe.id, weekStart });
      }
      await load();
    } catch {
      setError("A IA gratuita não respondeu agora. Vocês ainda podem escolher na mão.");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="collection-view collection-view--wide" aria-labelledby="meals-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Planejamento leve</p>
          <h1 id="meals-title">Cardápio da semana</h1>
          <p>Toquem no horário, escolham a receita ou escrevam a de vocês. A lista de compras se monta sozinha.</p>
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

      <div className="meals-toolbar">
        <button className="identity-action" type="button" onClick={() => void fillWeekWithAi()} disabled={aiBusy}>
          <Sparkles size={16} aria-hidden="true" />
          {aiBusy ? "Montando…" : "Sugerir a semana com IA"}
        </button>
        <p>A IA só preenche o que ainda está vazio. Vocês trocam qualquer refeição depois.</p>
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
                      <small>
                        {meal.quick ? (
                          <>
                            <Clock3 size={12} aria-hidden="true" /> Rápida · {meal.prepMinutes} min
                          </>
                        ) : (
                          <>{meal.prepMinutes} min</>
                        )}
                      </small>
                      <div className="slot-actions">
                        <button type="button" className="quiet-button" onClick={() => setPicking({ date, mealType })}>
                          Trocar
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          aria-label={`Limpar ${MEAL_LABELS[mealType]}`}
                          onClick={() => void clear(date, mealType)}
                        >
                          Limpar
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ghost-slot"
                      onClick={() => setPicking({ date, mealType })}
                    >
                      Escolher {MEAL_SHORT[mealType].toLowerCase()}
                    </button>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>

      {picking ? (
        <MealPicker
          date={picking.date}
          mealType={picking.mealType}
          weekStart={weekStart}
          onPick={(recipe) => void saveRecipe(picking.date, picking.mealType, recipe).catch(() => setError("Não deu para salvar essa refeição."))}
          onCustom={(title) => void saveCustom(picking.date, picking.mealType, title).catch(() => setError("Não deu para salvar essa refeição."))}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </section>
  );
}

function MealPicker({
  date,
  mealType,
  weekStart,
  onPick,
  onCustom,
  onClose,
}: {
  date: string;
  mealType: MealType;
  weekStart: string;
  onPick: (recipe: Recipe) => void;
  onCustom: (title: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
  const [custom, setCustom] = useState("");
  const [ai, setAi] = useState<RecipeSuggestion[]>([]);
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const recipes = useMemo(() => {
    const needle = foldName(search);
    return recipesFor(mealType, maxMinutes).filter((recipe) => {
      if (!needle) return true;
      const haystack = foldName(`${recipe.title} ${recipe.ingredients.map((item) => item.name).join(" ")}`);
      return haystack.includes(needle);
    });
  }, [mealType, maxMinutes, search]);

  async function askAi() {
    setAiBusy(true);
    setAiError("");
    try {
      const result = (await household.ai(
        weekStart,
        `Sugira ${MEAL_LABELS[mealType].toLowerCase()} para ${formatWeekdayShort(date)}.`,
      )) as { ok: boolean; suggestions?: RecipeSuggestion[]; error?: string };
      const matched = (result.suggestions ?? []).filter((item) => item.mealType === mealType);
      if (!result.ok) setAiError(result.error ?? "A IA não respondeu.");
      else setAi(matched.length ? matched : result.suggestions ?? []);
    } catch {
      setAiError("A IA gratuita não respondeu agora.");
    } finally {
      setAiBusy(false);
    }
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (custom.trim()) onCustom(custom.trim());
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="editor-sheet sheet-card"
        aria-labelledby="picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">{formatWeekdayShort(date)} · {MEAL_LABELS[mealType]}</p>
        <h2 id="picker-title">Escolher refeição</h2>
        <p className="picker-lead">Catálogo completo, busca, receita escrita na mão e sugestão da IA.</p>

        <label className="picker-search" htmlFor="recipe-search">Buscar receita</label>
        <input
          id="recipe-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ex.: frango, banana, sopa"
        />

        <div className="chip-row" role="group" aria-label="Filtro de tempo">
          <button type="button" className={!maxMinutes ? "is-active" : undefined} onClick={() => setMaxMinutes(undefined)}>
            Todas
          </button>
          <button type="button" className={maxMinutes === 15 ? "is-active" : undefined} onClick={() => setMaxMinutes(15)}>
            Até 15 min
          </button>
          <button type="button" className={maxMinutes === 20 ? "is-active" : undefined} onClick={() => setMaxMinutes(20)}>
            Até 20 min
          </button>
        </div>

        <button className="quiet-button ai-inline" type="button" onClick={() => void askAi()} disabled={aiBusy}>
          <Sparkles size={14} aria-hidden="true" />
          {aiBusy ? "Consultando a IA…" : "Pedir sugestão da IA neste horário"}
        </button>
        {aiError ? <p role="alert">{aiError}</p> : null}

        {ai.length > 0 ? (
          <>
            <h3 className="picker-section">Sugestões da IA</h3>
            <ul className="recipe-list">
              {ai.map((item) => {
                const recipe = RECIPES.find((entry) => entry.id === item.id);
                return (
                  <li key={`ai-${item.id}`}>
                    <button type="button" onClick={() => recipe && onPick(recipe)}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.prepMinutes} min{item.quick ? " · rápida" : ""}
                        {item.reason ? ` · ${item.reason}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        <h3 className="picker-section">Todas as receitas</h3>
        <ul className="recipe-list" aria-label="Catálogo de receitas">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <button type="button" onClick={() => onPick(recipe)}>
                <strong>{recipe.title}</strong>
                <span>
                  {recipe.prepMinutes} min{recipe.quick ? " · rápida" : ""} · {recipe.ingredients.map((item) => item.name).slice(0, 3).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {recipes.length === 0 ? <p>Nenhuma receita com esse filtro. Limpe a busca ou escrevam a de vocês abaixo.</p> : null}

        <form className="identity-form" onSubmit={submitCustom}>
          <label htmlFor="custom-meal">Ou escrever na mão</label>
          <input
            id="custom-meal"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Ex.: resto do almoço, marmita"
          />
          <div className="form-actions">
            <button className="identity-action" type="submit">
              Usar esta refeição
            </button>
            <button className="quiet-button" type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
