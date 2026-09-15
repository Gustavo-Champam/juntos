import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, CookingPot, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/civil";
import { clearMeal, listMeals, saveMeal, suggestMeals } from "@/lib/meals";
import { MEAL_LABELS, MEAL_SHORT, type Recipe } from "@/lib/recipes";
import type { MealType, PlannedMeal } from "@/lib/types";

const SLOTS: MealType[] = ["breakfast", "lunch", "dinner"];

export function MealsScreen() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null);
  const weekEnd = addCivilDays(weekStart, 6);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index)),
    [weekStart],
  );
  const queryClient = useQueryClient();

  const mealsQuery = useQuery({
    queryKey: ["meals", weekStart, weekEnd],
    queryFn: () => listMeals({ data: { from: weekStart, to: weekEnd } }),
  });

  const bySlot = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    for (const meal of mealsQuery.data ?? []) map.set(`${meal.date}:${meal.mealType}`, meal);
    return map;
  }, [mealsQuery.data]);

  const save = useMutation({
    mutationFn: (input: { date: string; mealType: MealType; recipeId?: string | null; title?: string }) =>
      saveMeal({ data: { ...input, weekStart } }),
    onSuccess: async () => {
      setPicking(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping"] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: (input: { date: string; mealType: MealType }) => clearMeal({ data: { ...input, weekStart } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping"] }),
      ]);
    },
  });

  return (
    <section className="collection-view collection-view--wide" aria-labelledby="meals-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Planejamento leve</p>
          <h1 id="meals-title">Cardápio da semana</h1>
          <p>Refeições simples, com opções rápidas nos dias de faculdade.</p>
        </div>
        <span className="collection-count">
          <CookingPot size={16} aria-hidden="true" />
          {mealsQuery.data?.length ?? 0} refeições combinadas
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls" aria-label="Semana">
          <button type="button" onClick={() => setWeekStart((d) => addCivilDays(d, -7))}>
            ‹
          </button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(today))}>
            Esta semana
          </button>
          <button type="button" onClick={() => setWeekStart((d) => addCivilDays(d, 7))}>
            ›
          </button>
        </div>
        <p className="toolbar-label">
          {formatDayMonth(weekStart)} — {formatDayMonth(weekEnd)}
        </p>
      </div>

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
                          <Clock3 size={12} aria-hidden="true" />
                          Rápida · {meal.prepMinutes} min
                        </small>
                      ) : (
                        <small>{meal.prepMinutes} min</small>
                      )}
                      <div className="slot-actions">
                        <button type="button" className="quiet-button" onClick={() => setPicking({ date, mealType })}>
                          Trocar
                        </button>
                        <button
                          type="button"
                          className="icon-quiet"
                          aria-label={`Limpar ${MEAL_LABELS[mealType]}`}
                          onClick={() => remove.mutate({ date, mealType })}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="ghost-slot" onClick={() => setPicking({ date, mealType })}>
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
          onPick={(recipe) => save.mutate({ date: picking.date, mealType: picking.mealType, recipeId: recipe.id })}
          onCustom={(title) => save.mutate({ date: picking.date, mealType: picking.mealType, title })}
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
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
  const [custom, setCustom] = useState("");
  const suggestions = useQuery({
    queryKey: ["suggest", mealType, maxMinutes, weekStart],
    queryFn: () => suggestMeals({ data: { mealType, maxMinutes, weekStart } }),
  });

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="editor-sheet sheet-card"
        aria-labelledby="picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">{formatWeekdayShort(date)} · {MEAL_LABELS[mealType]}</p>
        <h2 id="picker-title">Escolher refeição</h2>
        <div className="chip-row">
          <button type="button" className={!maxMinutes ? "is-active" : undefined} onClick={() => setMaxMinutes(undefined)}>
            Todas
          </button>
          <button type="button" className={maxMinutes === 15 ? "is-active" : undefined} onClick={() => setMaxMinutes(15)}>
            <Sparkles size={14} /> Até 15 min
          </button>
          <button type="button" className={maxMinutes === 20 ? "is-active" : undefined} onClick={() => setMaxMinutes(20)}>
            Até 20 min
          </button>
        </div>
        <ul className="recipe-list">
          {(suggestions.data ?? []).map((recipe) => (
            <li key={recipe.id}>
              <button type="button" onClick={() => onPick(recipe)}>
                <strong>{recipe.title}</strong>
                <span>
                  {recipe.prepMinutes} min{recipe.quick ? " · rápida" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="identity-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (custom.trim()) onCustom(custom.trim());
          }}
        >
          <label htmlFor="custom-meal">Ou escrever na mão</label>
          <input id="custom-meal" value={custom} onChange={(event) => setCustom(event.target.value)} />
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
