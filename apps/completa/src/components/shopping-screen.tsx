import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, ShoppingBasket, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/civil";
import { listMeals, saveMeal } from "@/lib/meals";
import { CATEGORY_LABELS, MEAL_SHORT } from "@/lib/recipes";
import type { RecipeSuggestion } from "@/lib/recipe-suggest";
import { addRecipeIngredients, addShoppingItem, listShopping, removeShoppingItem, suggestRecipesForList, toggleShoppingItem } from "@/lib/shopping";
import { askAiRecipes } from "@/lib/ai-recipes";
import type { IngredientCategory, MealType, PlannedMeal } from "@/lib/types";

const CATEGORIES: IngredientCategory[] = ["hortifruti", "mercearia", "carnes", "laticinios", "outros"];

export function ShoppingScreen() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("hortifruti");
  const queryClient = useQueryClient();
  const weekEnd = addCivilDays(weekStart, 6);

  const query = useQuery({
    queryKey: ["shopping", weekStart],
    queryFn: () => listShopping({ data: { weekStart } }),
  });

  const mealsQuery = useQuery({
    queryKey: ["meals", weekStart, weekEnd],
    queryFn: () => listMeals({ data: { from: weekStart, to: weekEnd } }),
  });

  const items = query.data ?? [];
  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [items]);

  const toggle = useMutation({
    mutationFn: (input: { id: string; checked: boolean }) => toggleShoppingItem({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] });
    },
  });

  const add = useMutation({
    mutationFn: () =>
      addShoppingItem({
        data: { weekStart, name, quantity, category },
      }),
    onSuccess: async () => {
      setName("");
      setQuantity("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-suggestions"] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeShoppingItem({ data: { id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-suggestions"] }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    add.mutate();
  }

  const bought = items.filter((item) => item.checked).length;

  return (
    <section className="collection-view" aria-labelledby="shopping-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Gerada pelo cardápio</p>
          <h1 id="shopping-title">Lista de compras</h1>
          <p>Uma lista única para os dois acompanharem sem duplicar itens.</p>
        </div>
        <span className="collection-count" aria-live="polite">
          <ShoppingBasket size={16} aria-hidden="true" />
          {bought} de {items.length} comprados
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls">
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

      <RecipeSuggestions
        weekStart={weekStart}
        hasItems={items.length > 0}
        meals={mealsQuery.data ?? []}
      />

      {query.isPending ? <p className="day-subtitle">Montando a lista da semana…</p> : null}

      {items.length === 0 && !query.isPending ? (
        <div className="empty-day">
          <div>
            <h2>Lista ainda vazia</h2>
            <p>Escolham uma receita acima ou as refeições da semana — os ingredientes entram já somados.</p>
          </div>
        </div>
      ) : (
        grouped.map((group) => (
          <fieldset className="shopping-list" key={group.category}>
            <legend>{CATEGORY_LABELS[group.category]}</legend>
            {group.items.map((item) => (
              <label className="shopping-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggle.mutate({ id: item.id, checked: !item.checked })}
                />
                <span className="shopping-check" aria-hidden="true" />
                <span className="shopping-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.note}
                    {item.source === "manual" ? " · avulso" : ""}
                  </small>
                </span>
                <span className="shopping-quantity">{item.quantity}</span>
                {item.source === "manual" ? (
                  <button
                    type="button"
                    className="icon-quiet"
                    aria-label={`Remover ${item.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      remove.mutate(item.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </label>
            ))}
          </fieldset>
        ))
      )}

      <form className="identity-form add-item-form" onSubmit={submit}>
        <label htmlFor="item-name">Incluir item avulso</label>
        <input id="item-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: papel toalha" />
        <div className="form-grid">
          <div>
            <label htmlFor="item-qty">Quantidade</label>
            <input id="item-qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="2 un." />
          </div>
          <div>
            <label htmlFor="item-cat">Categoria</label>
            <select id="item-cat" value={category} onChange={(event) => setCategory(event.target.value as IngredientCategory)}>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="identity-action" type="submit" disabled={add.isPending}>
          {add.isPending ? "Adicionando…" : "Adicionar à lista"}
        </button>
      </form>
    </section>
  );
}

function RecipeSuggestions({
  weekStart,
  hasItems,
  meals,
}: {
  weekStart: string;
  hasItems: boolean;
  meals: PlannedMeal[];
}) {
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
  const [picking, setPicking] = useState<RecipeSuggestion | null>(null);
  const [aiNote, setAiNote] = useState("");
  const [aiList, setAiList] = useState<RecipeSuggestion[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const suggestions = useQuery({
    queryKey: ["recipe-suggestions", weekStart, mealType, maxMinutes],
    queryFn: () => suggestRecipesForList({ data: { weekStart, mealType, maxMinutes } }),
  });

  const addToList = useMutation({
    mutationFn: (recipeId: string) => addRecipeIngredients({ data: { weekStart, recipeId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping"] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-suggestions"] }),
      ]);
    },
  });

  const addToMenu = useMutation({
    mutationFn: (input: { date: string; mealType: MealType; recipeId: string }) =>
      saveMeal({ data: { ...input, weekStart } }),
    onSuccess: async () => {
      setPicking(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping"] }),
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-suggestions"] }),
      ]);
    },
  });

  const askAi = useMutation({
    mutationFn: () => askAiRecipes({ data: { weekStart, note: aiNote } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setAiError(result.error);
        return;
      }
      setAiError(null);
      setAiList(result.suggestions);
    },
    onError: () => {
      setAiError("Não deu para falar com a IA agora. Tentem de novo.");
    },
  });

  const list = aiList ?? suggestions.data ?? [];
  const pendingId = addToList.isPending ? (addToList.variables ?? null) : null;

  return (
    <section className="suggestion-panel" aria-labelledby="suggestions-title">
      <p className="eyebrow">Sugestões para a lista</p>
      <h2 id="suggestions-title">
        {hasItems ? "Receitas que combinam com a lista" : "Receitas para montar a lista"}
      </h2>
      <p>
        {hasItems
          ? "Usam o que vocês já vão comprar. O que faltar entra sozinho."
          : "Escolham duas ou três. Os ingredientes se juntam numa lista só."}
      </p>

      <div className="chip-row">
        <button type="button" className={!mealType && !maxMinutes ? "is-active" : undefined} onClick={() => { setMealType(undefined); setMaxMinutes(undefined); setAiList(null); }}>
          Todas
        </button>
        <button type="button" className={mealType === "breakfast" ? "is-active" : undefined} onClick={() => { setMealType("breakfast"); setAiList(null); }}>
          Café
        </button>
        <button type="button" className={mealType === "lunch" ? "is-active" : undefined} onClick={() => { setMealType("lunch"); setAiList(null); }}>
          Almoço
        </button>
        <button type="button" className={mealType === "dinner" ? "is-active" : undefined} onClick={() => { setMealType("dinner"); setAiList(null); }}>
          Jantar
        </button>
        <button type="button" className={maxMinutes === 20 ? "is-active" : undefined} onClick={() => { setMaxMinutes((current) => (current === 20 ? undefined : 20)); setAiList(null); }}>
          Até 20 min
        </button>
      </div>

      <form
        className="ai-ask"
        onSubmit={(event) => {
          event.preventDefault();
          askAi.mutate();
        }}
      >
        <label htmlFor="ai-note">Pedir à IA gratuita</label>
        <div className="ai-ask-row">
          <input
            id="ai-note"
            value={aiNote}
            onChange={(event) => setAiNote(event.target.value)}
            placeholder="Ex.: tem frango e banana em casa"
          />
          <button className="identity-action" type="submit" disabled={askAi.isPending}>
            <Sparkles size={16} aria-hidden="true" />
            {askAi.isPending ? "Consultando…" : "Sugerir com IA"}
          </button>
        </div>
        <p className="identity-note">
          Roteada pelos provedores gratuitos do{" "}
          <a href="https://www.omniroute.online/pt-BR/" target="_blank" rel="noreferrer">
            OmniRoute
          </a>
          . Só quando vocês pedem.
        </p>
      </form>

      {aiError ? <p className="form-alert">{aiError}</p> : null}
      {aiList ? <p className="suggestion-match">Sugestões da IA para esta lista.</p> : null}

      {suggestions.isPending ? <p className="day-subtitle">Pensando em receitas…</p> : null}

      {list.length === 0 && !suggestions.isPending ? (
        <p className="day-subtitle">Nenhuma receita neste filtro. Tente outra refeição.</p>
      ) : (
        <ul className="suggestion-grid">
          {list.map((recipe) => (
            <li key={recipe.id}>
              <article className="suggestion-card">
                <span className="meal-label">{MEAL_SHORT[recipe.mealType]}</span>
                <h3>{recipe.title}</h3>
                <p className="suggestion-meta">
                  <span>
                    <Clock3 size={12} aria-hidden="true" />
                    {recipe.prepMinutes} min{recipe.quick ? " · rápida" : ""}
                  </span>
                  <span>{recipe.servings} pessoas</span>
                </p>
                {recipe.reason ? <p className="day-subtitle">{recipe.reason}</p> : null}
                <p className="suggestion-match">
                  {hasItems && recipe.matchedCount > 0
                    ? `Já tem ${recipe.matchedCount} de ${recipe.ingredientCount} ingredientes`
                    : `Adiciona ${recipe.ingredientCount} ${recipe.ingredientCount === 1 ? "item" : "itens"}`}
                </p>
                {recipe.missingNames.length > 0 ? (
                  <ul className="missing-chips">
                    {recipe.missingNames.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="suggestion-complete">Nada a mais na feira.</p>
                )}
                <div className="suggestion-actions">
                  <button type="button" className="identity-action" onClick={() => setPicking(recipe)}>
                    Incluir no cardápio
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={pendingId === recipe.id || recipe.missingNames.length === 0}
                    onClick={() => addToList.mutate(recipe.id)}
                  >
                    {pendingId === recipe.id
                      ? "Colocando…"
                      : recipe.missingNames.length === 0
                        ? "Já na lista"
                        : "Só na lista"}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {picking ? (
        <DayPicker
          recipe={picking}
          weekStart={weekStart}
          meals={meals}
          pending={addToMenu.isPending}
          error={addToMenu.error instanceof Error ? addToMenu.error.message : null}
          onPick={(date) => addToMenu.mutate({ date, mealType: picking.mealType, recipeId: picking.id })}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </section>
  );
}

function DayPicker({
  recipe,
  weekStart,
  meals,
  pending,
  error,
  onPick,
  onClose,
}: {
  recipe: RecipeSuggestion;
  weekStart: string;
  meals: PlannedMeal[];
  pending: boolean;
  error: string | null;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index)),
    [weekStart],
  );
  const occupied = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    for (const meal of meals) map.set(`${meal.date}:${meal.mealType}`, meal);
    return map;
  }, [meals]);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="editor-sheet sheet-card"
        aria-labelledby="day-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">{recipe.mealLabel}</p>
        <h2 id="day-picker-title">{recipe.title}</h2>
        <p className="day-subtitle">Escolham o dia. Os ingredientes entram na lista desta semana.</p>
        <div className="day-pick-grid">
          {days.map((date) => {
            const current = occupied.get(`${date}:${recipe.mealType}`);
            return (
              <button
                type="button"
                className={current ? "day-pick" : "day-pick is-open"}
                key={date}
                disabled={pending}
                onClick={() => onPick(date)}
              >
                <strong>
                  {formatWeekdayShort(date)} · {formatDayMonth(date)}
                </strong>
                <span>{current ? `Trocar ${current.title}` : "Horário livre"}</span>
              </button>
            );
          })}
        </div>
        {error ? <p className="form-alert">{error}</p> : null}
        <div className="form-actions">
          <button className="quiet-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}
