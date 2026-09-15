import { addCivilDays, civilToday, parseCivilDate, weekday } from "@juntos/contracts";

import type { AgendaService } from "../agenda/agenda-service.js";
import { omniChat } from "./omniroute.js";
import { foldName } from "./recipe-suggest.js";
import { formatMealTitle } from "./format-title.js";
import { getRecipe, MEAL_LABELS, RECIPES } from "./recipes.js";
import type { HouseholdService } from "./household-service.js";
import type { IngredientCategory, MealType } from "./types.js";

export type AssistantAction =
  | { type: "agenda"; title: string; date: string; time: string; location: string; durationMinutes: number }
  | { type: "meal"; date: string; mealType: MealType; title: string; recipeId: string | null; time?: string }
  | { type: "shopping"; name: string; quantity: string; category: IngredientCategory };

export type AssistantResult = AssistantAction & { ok: boolean; detail: string };

const WEEKDAYS: Record<string, number> = {
  domingo: 7,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const FOOD_HINT =
  /\b(arroz|feijao|tilapia|salada|frango|carne|bife|macarrao|ovo|ovos|strogonoff|estrogonofe|lasanha|pizza|sopa|wrap|cuscuz|tapioca|panqueca|yakissoba|escondidinho|omelete|sanduiche|mingau|caldo|iogurte|granola)\b/;

const AGENDA_HINT =
  /\b(agenda|consulta|compromisso|reuniao|exame|medico|dentista|faculdade|mercado|academia|caminhada|trabalho|aula)\b/;

function startOfWeek(date: string): string {
  return addCivilDays(parseCivilDate(date), 1 - weekday(date));
}

function nextWeekday(today: string, target: number): string {
  const current = weekday(today);
  const delta = target === current ? 7 : (target - current + 7) % 7;
  return addCivilDays(today, delta);
}

export function resolveSpokenDate(text: string, today = civilToday()): string | null {
  const folded = foldName(text);
  if (/\bhoje\b/.test(folded)) return today;
  if (/\bdepois de amanha\b/.test(folded)) return addCivilDays(today, 2);
  if (/\bamanha\b/.test(folded)) return addCivilDays(today, 1);
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(folded)) return nextWeekday(today, day);
  }
  const numeric = folded.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numeric) {
    const day = numeric[1]!.padStart(2, "0");
    const month = numeric[2]!.padStart(2, "0");
    const year = numeric[3] ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : today.slice(0, 4);
    try {
      return parseCivilDate(`${year}-${month}-${day}`);
    } catch {
      return null;
    }
  }
  return null;
}

export function extractSpokenTime(text: string): string | null {
  const folded = foldName(text);
  if (/\bmeio dia e meia\b/.test(folded)) return "12:30";
  if (/\bmeio dia\b/.test(folded)) return "12:00";
  const marked = folded.match(
    /\b(?:as\s+)?([01]?\d|2[0-3])(?:\s*h\s*([0-5]\d)?|\s*:\s*([0-5]\d)|\s*(?:hrs?|horas?)(?:\s*([0-5]\d))?)\b/,
  );
  if (marked) {
    const hour = Number(marked[1]);
    if (hour > 23) return null;
    const minute = (marked[2] ?? marked[3] ?? marked[4] ?? "00").padStart(2, "0");
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  const asHour = folded.match(/\bas\s+([01]?\d|2[0-3])\b/);
  if (asHour) return `${asHour[1]!.padStart(2, "0")}:00`;
  return null;
}

function timeFromPeriod(text: string): string | null {
  const folded = foldName(text);
  if (/\b(a noite|de noite|da noite)\b/.test(folded)) return "19:00";
  if (/\b(de tarde|da tarde)\b/.test(folded)) return "14:00";
  if (/\b(de manha|da manha)\b/.test(folded)) return "09:00";
  return null;
}

function extractDuration(text: string): number {
  const folded = foldName(text);
  const minutes = folded.match(/\b(?:de\s+)?(\d{2,3})\s*min(?:utos)?\b/);
  if (minutes) return Math.min(480, Number(minutes[1]));
  const hours = folded.match(/\b(?:de\s+)?([1-4])\s*horas?\b/);
  if (hours) return Number(hours[1]) * 60;
  return 60;
}

export function guessCategory(name: string): IngredientCategory {
  const folded = foldName(name);
  if (/\b(banana|alface|tomate|fruta|legume|cebola|alho|salada|batata|couve|limao|maca|mamao|cenoura|abobrinha)\b/.test(folded)) {
    return "hortifruti";
  }
  if (/\b(leite|queijo|iogurte|manteiga|creme|ovo|ovos)\b/.test(folded)) return "laticinios";
  if (/\b(frango|carne|bife|peixe|tilapia|bacon|moida)\b/.test(folded)) return "carnes";
  if (/\b(arroz|feijao|macarrao|pao|oleo|molho|granola|aveia|massa|cuscuz|tapioca)\b/.test(folded)) return "mercearia";
  return "outros";
}

function matchRecipe(title: string, mealType?: MealType) {
  const tokens = foldName(title)
    .split(" ")
    .filter((token) => token.length > 2 && !["com", "hoje", "amanha", "jantar", "janta", "almoco", "cafe"].includes(token));
  const pool = mealType ? RECIPES.filter((recipe) => recipe.mealType === mealType) : RECIPES;
  for (const token of tokens) {
    if (token.length < 5) continue;
    const unique = pool.filter((recipe) => foldName(recipe.title).includes(token));
    if (unique.length === 1) return unique[0];
  }
  let best: { id: string; score: number; leftover: number } | null = null;
  for (const recipe of pool) {
    const haystack = foldName(`${recipe.title} ${recipe.ingredients.map((item) => item.name).join(" ")}`);
    const score = tokens.filter((token) => haystack.includes(token)).length;
    const leftover = tokens.filter((token) => !haystack.includes(token)).length;
    if (score < 2 || leftover > 0) continue;
    if (!best || score - leftover > best.score - best.leftover) {
      best = { id: recipe.id, score, leftover };
    }
  }
  return best ? getRecipe(best.id) : undefined;
}

function mealTypeFrom(text: string): MealType | null {
  const folded = foldName(text);
  if (/\b(janta|jantar|a noite|de noite|da noite)\b/.test(folded)) return "dinner";
  if (/\b(almoco|de tarde|da tarde)\b/.test(folded)) return "lunch";
  if (/\b(cafe|de manha|da manha)\b/.test(folded)) return "breakfast";
  return null;
}

function parseShopping(folded: string): AssistantAction[] {
  const match = folded.match(
    /\b(?:coloca|poe|bota|adiciona|compra|comprar|falta|precisamos de|precisa de)\s+(.+?)(?:\s+na lista)?(?=\s+e (?:que |a janta|o jantar|o almoco|a consulta)|$)/,
  );
  const alt = folded.match(/\bna lista(?: de compras)?[: ]+(.+)$/);
  const raw = match?.[1] ?? alt?.[1];
  if (!raw) return [];
  return raw
    .split(/\s*,\s*|\s+e\s+/)
    .map((part) => part.replace(/\bna lista\b/g, "").trim())
    .filter((part) => part.length > 1 && !AGENDA_HINT.test(part) && !/^(hoje|amanha|depois|que)$/.test(part))
    .slice(0, 8)
    .map((name) => ({ type: "shopping" as const, name: name.slice(0, 80), quantity: "", category: guessCategory(name) }));
}

export function parseAssistantCommand(text: string, today = civilToday()): AssistantAction[] {
  const folded = foldName(text);
  const actions: AssistantAction[] = [];
  const date = resolveSpokenDate(text, today) ?? today;
  const time = extractSpokenTime(text);

  const mealRe =
    /\b(cafe(?: da manha)?|almoco|janta|jantar)\b(?:\s+(?:de hoje|de amanha|da noite|da tarde))?(?:\s+(?:vai ser|sera|eh|e|de|:))*\s+(.+?)(?=\s+(?:e (?:que |coloca|poe|bota|a noite|de manha|a tarde|depois)|consulta|compromisso|faculdade|exame|medico|dentista|na lista)|$)/g;
  let mealHit = false;
  for (const mealMatch of folded.matchAll(mealRe)) {
    const mealType = mealTypeFrom(mealMatch[1] ?? "") ?? "dinner";
    const title = (mealMatch[2] ?? "").replace(/\s+e que .*$/, "").trim();
    if (!title || AGENDA_HINT.test(title) && !FOOD_HINT.test(title)) continue;
    mealHit = true;
    const recipe = matchRecipe(title, mealType);
    const mealTime = extractSpokenTime(mealMatch[0]);
    actions.push({
      type: "meal",
      date,
      mealType,
      title: recipe?.title ?? formatMealTitle(title),
      recipeId: recipe?.id ?? null,
      ...(mealTime ? { time: mealTime } : {}),
    });
  }

  if (!mealHit && FOOD_HINT.test(folded)) {
    const plate = text
      .replace(/^(hoje|amanhã|amanha)[,:]?\s+/i, "")
      .replace(/\b(consulta|faculdade|exame|compromisso|mercado|aula).*$/i, "")
      .trim();
    const mealType = mealTypeFrom(folded) ?? "lunch";
    const recipe = matchRecipe(plate, mealType);
    const mealTime = extractSpokenTime(plate);
    actions.push({
      type: "meal",
      date,
      mealType,
      title: recipe?.title ?? formatMealTitle(plate),
      recipeId: recipe?.id ?? null,
      ...(mealTime ? { time: mealTime } : {}),
    });
  }

  if (AGENDA_HINT.test(folded)) {
    const named = text.match(
      /\b(consulta|exame|reuni[aã]o|m[eé]dico|dentista|faculdade|trabalho|mercado|caminhada|academia|aula|compromisso)\b/i,
    );
    const title = named?.[1]
      ? named[1].slice(0, 1).toUpperCase() + named[1].slice(1).toLowerCase()
      : "Compromisso";
    const place = folded.match(/\bno\s+([a-z0-9 ]{3,40}?)(?:\s+as|\s+amanha|\s+hoje|$)/);
    const eventTime = time ?? timeFromPeriod(folded) ?? "09:00";
    actions.unshift({
      type: "agenda",
      title,
      date,
      time: eventTime,
      location: place?.[1]?.trim() ?? "",
      durationMinutes: extractDuration(text),
    });
  }

  actions.push(...parseShopping(folded));
  return actions;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function actionsFromModel(raw: unknown, today: string): AssistantAction[] {
  if (!raw || typeof raw !== "object" || !("actions" in raw) || !Array.isArray(raw.actions)) return [];
  const out: AssistantAction[] = [];
  for (const row of raw.actions) {
    if (!row || typeof row !== "object") continue;
    const type = "type" in row && typeof row.type === "string" ? row.type : "";
    if (type === "agenda") {
      const title = "title" in row && typeof row.title === "string" ? row.title.trim() : "";
      const date = "date" in row && typeof row.date === "string" ? row.date : today;
      const time = "time" in row && typeof row.time === "string" ? row.time : "";
      if (!title || !/^\d{2}:\d{2}$/.test(time)) continue;
      try {
        out.push({
          type: "agenda",
          title: title.slice(0, 120),
          date: parseCivilDate(date),
          time,
          location: "location" in row && typeof row.location === "string" ? row.location.slice(0, 200) : "",
          durationMinutes:
            "durationMinutes" in row && typeof row.durationMinutes === "number" ? row.durationMinutes : 60,
        });
      } catch {
        continue;
      }
    }
    if (type === "meal") {
      const title = "title" in row && typeof row.title === "string" ? row.title.trim() : "";
      const mealTypeRaw = "mealType" in row ? row.mealType : undefined;
      const mealType: MealType | null =
        mealTypeRaw === "breakfast" || mealTypeRaw === "lunch" || mealTypeRaw === "dinner"
          ? mealTypeRaw
          : mealTypeFrom(title);
      const date = "date" in row && typeof row.date === "string" ? row.date : today;
      if (!title || !mealType) continue;
      try {
        const recipe = matchRecipe(title, mealType);
        out.push({
          type: "meal",
          date: parseCivilDate(date),
          mealType,
          title: recipe?.title ?? formatMealTitle(title),
          recipeId: recipe?.id ?? null,
          ...("time" in row && typeof row.time === "string" ? { time: row.time } : {}),
        });
      } catch {
        continue;
      }
    }
    if (type === "shopping") {
      const name = "name" in row && typeof row.name === "string" ? row.name.trim() : "";
      if (!name) continue;
      const quantity = "quantity" in row && typeof row.quantity === "string" ? row.quantity : "";
      out.push({ type: "shopping", name: name.slice(0, 80), quantity, category: guessCategory(name) });
    }
  }
  return out;
}

function mergeActions(primary: AssistantAction[], extra: AssistantAction[]): AssistantAction[] {
  const merged = [...primary];
  for (const action of extra) {
    const duplicate = merged.some((item) => {
      if (item.type !== action.type) return false;
      if (item.type === "agenda" && action.type === "agenda") return item.date === action.date && item.time === action.time;
      if (item.type === "meal" && action.type === "meal") return item.date === action.date && item.mealType === action.mealType;
      if (item.type === "shopping" && action.type === "shopping") return foldName(item.name) === foldName(action.name);
      return false;
    });
    if (!duplicate) merged.push(action);
  }
  return merged;
}

export class AssistantService {
  constructor(
    private readonly household: HouseholdService,
    private readonly agenda: AgendaService,
  ) {}

  async run(userId: string, command: string): Promise<{
    ok: boolean;
    summary: string;
    results: AssistantResult[];
    error?: string;
  }> {
    const text = command.trim().slice(0, 400);
    if (text.length < 4) {
      return { ok: false, summary: "", results: [], error: "Escrevam o que vocês querem colocar na rotina." };
    }

    const today = civilToday();
    let actions = parseAssistantCommand(text, today);
    const weekStart = startOfWeek(today);
    const weekEnd = addCivilDays(weekStart, 6);

    let context = "";
    try {
      const [meals, shopping, agenda] = await Promise.all([
        this.household.listMeals(userId, weekStart, weekEnd),
        this.household.listShopping(userId, weekStart),
        this.agenda.list(userId, { from: today, to: addCivilDays(today, 6) }),
      ]);
      const mealText = meals.map((meal) => `${meal.date} ${MEAL_LABELS[meal.mealType]}: ${meal.title}`).join("; ") || "vazio";
      const shopText = shopping.map((item) => item.name).slice(0, 20).join(", ") || "vazia";
      const agendaText =
        agenda.changed
          ? agenda.snapshot.occurrences
              .map((item) => `${item.date} ${item.event.time} ${item.event.title}`)
              .slice(0, 12)
              .join("; ") || "vazia"
          : "vazia";
      context = `Cardápio da semana: ${mealText}\nLista: ${shopText}\nAgenda: ${agendaText}\n`;
    } catch {
      context = "";
    }

    const catalog = RECIPES.map((recipe) => `${recipe.id}=${recipe.title}`).join("; ");
    const model = await omniChat({
      maxTokens: 520,
      messages: [
        {
          role: "system",
          content:
            `Você é o assistente do app Juntos, de um casal no Brasil (America/Sao_Paulo). Hoje é ${today}. ${context}Catálogo: ${catalog}. Responda SÓ JSON: {"actions":[...]}. Tipos: agenda {type,title,date,time,location,durationMinutes}, meal {type,date,mealType,title,time}, shopping {type,name,quantity}. mealType: breakfast|lunch|dinner. date YYYY-MM-DD. time HH:MM 24h. Se o prato existir no catálogo, use o title exato. Não invente compromissos sem o casal pedir. Sem markdown.`,
        },
        {
          role: "user",
          content: `Pedido: ${text}\nExemplo: "almoço é strogonoff e faculdade 19h" → meal lunch Strogonoff de frango + agenda Faculdade 19:00.`,
        },
      ],
    });
    if (model.ok) {
      actions = mergeActions(actions, actionsFromModel(extractJson(model.text), today));
    }

    if (actions.length === 0) {
      return {
        ok: false,
        summary: "",
        results: [],
        error: "Não entendi o pedido. Tentem: consulta amanhã 17h e jantar arroz, feijão e carne.",
      };
    }

    const results: AssistantResult[] = [];
    for (const action of actions) {
      try {
        if (action.type === "agenda") {
          await this.agenda.create(userId, {
            event: {
              title: action.title,
              date: action.date,
              time: action.time,
              durationMinutes: action.durationMinutes,
              location: action.location,
              notes: "",
              assigneeId: null,
              recurrence: null,
            },
          });
          results.push({
            ...action,
            ok: true,
            detail: `${action.title} em ${action.date} às ${action.time}`,
          });
        } else if (action.type === "meal") {
          await this.household.saveMeal(userId, {
            date: action.date,
            mealType: action.mealType,
            recipeId: action.recipeId,
            title: action.title,
            weekStart: startOfWeek(action.date),
            ...(action.time ? { time: action.time } : {}),
          });
          results.push({
            ...action,
            ok: true,
            detail: `${MEAL_LABELS[action.mealType]} de ${action.date}: ${action.title}`,
          });
        } else {
          await this.household.addShoppingItem(userId, {
            weekStart,
            name: action.name,
            quantity: action.quantity,
            category: action.category,
          });
          results.push({ ...action, ok: true, detail: `${action.name} na lista da semana` });
        }
      } catch {
        results.push({ ...action, ok: false, detail: "Não deu para salvar este item." });
      }
    }

    const saved = results.filter((item) => item.ok);
    if (saved.length === 0) {
      return { ok: false, summary: "", results, error: "Entendi o pedido, mas não consegui gravar agora." };
    }

    return {
      ok: true,
      summary: saved.map((item) => item.detail).join(". ") + ".",
      results,
    };
  }
}
