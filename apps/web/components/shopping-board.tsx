"use client";

import { Clock3, ShoppingBasket, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { addCivilDays, civilToday, formatDayMonth, startOfWeek } from "@/lib/dates";
import { household } from "@/lib/household-client";
import { CATEGORY_LABELS, MEAL_SHORT } from "@/lib/recipes";
import type { IngredientCategory, MealType } from "@/lib/household-types";
import type { RecipeSuggestion } from "@/lib/recipe-suggest";

type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  category: IngredientCategory;
  note: string;
  source: "auto" | "manual";
  checked: boolean;
};

const CATEGORIES: IngredientCategory[] = ["hortifruti", "mercearia", "carnes", "laticinios", "outros"];

export function ShoppingBoard() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);
  const [aiNote, setAiNote] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("hortifruti");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const weekEnd = addCivilDays(weekStart, 6);

  const load = useCallback(async () => {
    try {
      const [list, hints] = await Promise.all([
        household.shopping(weekStart) as Promise<ShoppingItem[]>,
        household.suggest(weekStart) as Promise<RecipeSuggestion[]>,
      ]);
      setItems(list);
      setSuggestions(hints);
      setError("");
    } catch {
      setError("Não foi possível abrir a lista.");
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      CATEGORIES.map((cat) => ({ category: cat, items: items.filter((item) => item.category === cat) })).filter(
        (group) => group.items.length > 0,
      ),
    [items],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      await household.addItem({ weekStart, name, quantity, category });
      setName("");
      setQuantity("");
      await load();
    } catch {
      setError("Não deu para acrescentar o item.");
    } finally {
      setPending(false);
    }
  }

  async function askAi(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = (await household.ai(weekStart, aiNote)) as { ok: boolean; suggestions?: RecipeSuggestion[]; error?: string };
      if (!result.ok) setError(result.error ?? "A IA não respondeu.");
      else {
        setSuggestions(result.suggestions ?? []);
        setError("");
      }
    } catch {
      setError("A IA gratuita não respondeu agora.");
    } finally {
      setPending(false);
    }
  }

  async function onlyList(recipeId: string) {
    await household.fromRecipe(weekStart, recipeId);
    await load();
  }

  async function ontoMenu(suggestion: RecipeSuggestion) {
    const days = Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index));
    const meals = (await household.meals(weekStart, weekEnd)) as { date: string; mealType: MealType }[];
    const used = new Set(meals.map((meal) => `${meal.date}:${meal.mealType}`));
    const date = days.find((day) => !used.has(`${day}:${suggestion.mealType}`)) ?? weekStart;
    await household.saveMeal({ date, mealType: suggestion.mealType, recipeId: suggestion.id, weekStart });
    await load();
  }

  const bought = items.filter((item) => item.checked).length;

  return (
    <section className="collection-view collection-view--wide" aria-labelledby="shopping-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Gerada pelo cardápio</p>
          <h1 id="shopping-title">Lista de compras</h1>
          <p>Uma lista só. Sugestões reaproveitam o que já está nela.</p>
        </div>
        <span className="collection-count">
          <ShoppingBasket size={16} aria-hidden="true" />
          {bought} de {items.length} comprados
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls" aria-label="Semana">
          <button type="button" onClick={() => setWeekStart((date) => addCivilDays(date, -7))}>‹</button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(today))}>Esta semana</button>
          <button type="button" onClick={() => setWeekStart((date) => addCivilDays(date, 7))}>›</button>
        </div>
        <p className="toolbar-label">{formatDayMonth(weekStart)} — {formatDayMonth(weekEnd)}</p>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      <form className="ai-ask" onSubmit={(event) => void askAi(event)}>
        <label htmlFor="ai-note">Pedir sugestão à IA</label>
        <div className="ai-ask-row">
          <input
            id="ai-note"
            value={aiNote}
            onChange={(event) => setAiNote(event.target.value)}
            placeholder="Ex.: temos frango e banana"
          />
          <button className="identity-action" type="submit" disabled={pending}>
            <Sparkles size={16} aria-hidden="true" /> Sugerir com IA
          </button>
        </div>
      </form>

      {suggestions.length > 0 ? (
        <ul className="suggestion-grid" aria-label="Sugestões de receitas">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <article className="suggestion-card">
                <p className="eyebrow">{MEAL_SHORT[suggestion.mealType]} {suggestion.quick ? "· Rápida" : ""}</p>
                <h3>{suggestion.title}</h3>
                {suggestion.reason ? <p>{suggestion.reason}</p> : null}
                <p className="suggestion-match">
                  {suggestion.matchedCount}/{suggestion.ingredientCount} já na lista
                </p>
                <div className="suggestion-meta">
                  <span>
                    <Clock3 size={12} aria-hidden="true" /> {suggestion.prepMinutes} min
                  </span>
                </div>
                <div className="suggestion-actions">
                  <button type="button" className="quiet-button" onClick={() => void onlyList(suggestion.id)}>
                    Só na lista
                  </button>
                  <button type="button" className="identity-action" onClick={() => void ontoMenu(suggestion)}>
                    Incluir no cardápio
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="identity-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="item-name">Acrescentar item</label>
        <input id="item-name" value={name} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="item-qty">Quantidade</label>
        <input id="item-qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <label htmlFor="item-cat">Setor</label>
        <select id="item-cat" value={category} onChange={(event) => setCategory(event.target.value as IngredientCategory)}>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <button className="identity-action" type="submit" disabled={pending}>Adicionar</button>
      </form>

      {grouped.map((group) => (
        <fieldset className="shopping-list" key={group.category}>
          <legend>{CATEGORY_LABELS[group.category]}</legend>
          {group.items.map((item) => (
            <label className="shopping-row" key={item.id}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => void household.toggleItem(item.id, !item.checked).then(load)}
              />
              <span className="shopping-check" aria-hidden="true" />
              <span className="shopping-copy">
                <strong>{item.name}</strong>
                <small>{item.note}</small>
              </span>
              <span className="shopping-quantity">{item.quantity}</span>
              {item.source === "manual" ? (
                <button type="button" className="quiet-button" onClick={() => void household.removeItem(item.id).then(load)}>
                  Tirar
                </button>
              ) : null}
            </label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
