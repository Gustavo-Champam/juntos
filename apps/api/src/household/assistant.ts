import { addCivilDays, civilToday, parseCivilDate, weekday } from "@juntos/contracts";

import type { AgendaService } from "../agenda/agenda-service.js";
import { omniChat } from "./omniroute.js";
import { foldName } from "./recipe-suggest.js";
import { formatMealTitle } from "./format-title.js";
import { getRecipe, MEAL_LABELS, RECIPES } from "./recipes.js";
import type { HouseholdService } from "./household-service.js";
import type { MealType } from "./types.js";

export type AssistantAction =
  | { type: "agenda"; title: string; date: string; time: string; location: string; durationMinutes: number }
  | { type: "meal"; date: string; mealType: MealType; title: string; recipeId: string | null; time?: string }
  | { type: "shopping"; name: string; quantity: string };

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
  const match = foldName(text).match(/\b([01]?\d|2[0-3])(?:\s*(?:[:h]|hrs?|horas?)\s*([0-5]\d)?)?\b/);
  if (!match) return null;
  const hour = match[1]!.padStart(2, "0");
  const minute = (match[2] ?? "00").padStart(2, "0");
  return `${hour}:${minute}`;
}

function matchRecipe(title: string, mealType?: MealType) {
  const tokens = foldName(title).split(" ").filter((token) => token.length > 2 && token !== "com");
  let best: { id: string; score: number; leftover: number } | null = null;
  for (const recipe of RECIPES) {
    if (mealType && recipe.mealType !== mealType) continue;
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
  if (/\b(janta|jantar)\b/.test(folded)) return "dinner";
  if (/\balmoco\b/.test(folded)) return "lunch";
  if (/\bcafe\b/.test(folded)) return "breakfast";
  return null;
}

export function parseAssistantCommand(text: string, today = civilToday()): AssistantAction[] {
  const folded = foldName(text);
  const actions: AssistantAction[] = [];
  const date = resolveSpokenDate(text, today) ?? today;
  const time = extractSpokenTime(text);

  const mealMatch = folded.match(
    /\b(cafe(?: da manha)?|almoco|janta|jantar)\b(?:\s+(?:de hoje|de amanha|da noite|da tarde))?(?:\s+(?:vai ser|sera|e|eh|de|:))+\s+(.+?)(?:\s+e (?:que |coloca|poe|bota)\b|$)/,
  );
  if (mealMatch) {
    const mealType = mealTypeFrom(mealMatch[1] ?? "") ?? "dinner";
    const title = (mealMatch[2] ?? "").replace(/\s+e que .*$/, "").trim();
    if (title) {
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
  } else if (/\b(arroz|feijao|tilapia|salada|frango|carne|bife|macarrao|ovo)\b/.test(folded)) {
    const plate = text.replace(/^(hoje|amanhã|amanha)[,:]?\s+/i, "").trim();
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

  const wantsAgenda = /\b(agenda|consulta|compromisso|reuniao|exame|medico|dentista|faculdade)\b/.test(folded);
  if (wantsAgenda && time) {
    const named = text.match(
      /\b(consulta|exame|reuni[aã]o|m[eé]dico|dentista|faculdade|trabalho|mercado|caminhada|compromisso)\b/i,
    );
    const title = named?.[1]
      ? named[1].slice(0, 1).toUpperCase() + named[1].slice(1).toLowerCase()
      : "Compromisso";
    const place = folded.match(/\bno\s+([a-z0-9 ]{3,40}?)(?:\s+as|\s+amanha|\s+hoje|$)/);
    actions.unshift({
      type: "agenda",
      title,
      date,
      time,
      location: place?.[1]?.trim() ?? "",
      durationMinutes: 60,
    });
  }

  const shop = folded.match(/\b(?:coloca|poe|bota|adiciona)\s+(.+?)\s+na lista\b/);
  if (shop?.[1]) {
    actions.push({ type: "shopping", name: shop[1].trim(), quantity: "" });
  }

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
          durationMinutes: 60,
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
      out.push({
        type: "shopping",
        name: name.slice(0, 80),
        quantity: "quantity" in row && typeof row.quantity === "string" ? row.quantity : "",
      });
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

    const model = await omniChat({
      maxTokens: 420,
      messages: [
        {
          role: "system",
          content:
            `Você transforma pedidos de um casal em JSON. Hoje é ${today} (America/Sao_Paulo). Responda só JSON: {"actions":[...]}. Tipos: agenda {type,title,date,time,location}, meal {type,date,mealType,title}, shopping {type,name,quantity}. mealType: breakfast|lunch|dinner. date YYYY-MM-DD. time HH:MM 24h. Sem markdown.`,
        },
        { role: "user", content: text },
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
            weekStart: startOfWeek(today),
            name: action.name,
            quantity: action.quantity,
            category: "outros",
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
