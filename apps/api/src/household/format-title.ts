import { foldName } from "./recipe-suggest.js";

const LEXICON: Record<string, string> = {
  arroz: "arroz",
  feijao: "feijão",
  feijaozinho: "feijão",
  tilapia: "tilápia",
  salada: "salada",
  carne: "carne",
  frango: "frango",
  peixe: "peixe",
  bife: "bife",
  ovo: "ovo",
  ovos: "ovos",
  macarrao: "macarrão",
  batata: "batata",
  legumes: "legumes",
  farofa: "farofa",
  vinagrete: "vinagrete",
  couve: "couve",
  alface: "alface",
  tomate: "tomate",
  queijo: "queijo",
  grelhada: "grelhada",
  grelhado: "grelhado",
  assada: "assada",
  assado: "assado",
  frita: "frita",
  frito: "frito",
  suco: "suco",
  banana: "banana",
  iogurte: "iogurte",
  granola: "granola",
};

const ADJECTIVES = new Set(["grelhada", "grelhado", "assada", "assado", "frita", "frito", "cozida", "cozido"]);

function polishWord(word: string): string {
  const folded = foldName(word);
  return LEXICON[folded] ?? word.toLowerCase();
}

export function formatMealTitle(raw: string): string {
  let text = raw.trim().replace(/\s+/g, " ");
  text = text.replace(/^(hoje|amanhã|amanha|depois de amanhã|depois de amanha)[,:]?\s+/i, "");
  text = text.replace(
    /^(o |a )?(café da manhã|cafe da manha|café|cafe|almoço|almoco|jantar|janta)\s+(vai ser|será|sera|é|e|:)\s+/i,
    "",
  );
  text = text.replace(/^(o |a )?(café da manhã|cafe da manha|café|cafe|almoço|almoco|jantar|janta)\s+/i, "");
  text = text.replace(/^(vai ser|será|sera)\s+/i, "");
  text = text.replace(/\b(?:às|as)\s+/gi, " ");
  text = text.replace(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?|\s*hrs?|\s*horas?)\b/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return raw.trim().slice(0, 120);

  const tokens = text.split(/\s+/).filter((token) => foldName(token) !== "com");
  const dishes: string[] = [];
  for (const token of tokens) {
    if (foldName(token) === "e") continue;
    const word = polishWord(token.replace(/,/g, ""));
    if (ADJECTIVES.has(foldName(word)) && dishes.length > 0) {
      dishes[dishes.length - 1] = `${dishes[dishes.length - 1]} ${word}`;
    } else {
      dishes.push(word);
    }
  }
  const pretty = dishes.filter(Boolean);
  if (pretty.length === 0) return text.slice(0, 1).toUpperCase() + text.slice(1);
  const joined =
    pretty.length === 1
      ? pretty[0]!
      : pretty.length === 2
        ? `${pretty[0]} e ${pretty[1]}`
        : `${pretty.slice(0, -1).join(", ")} e ${pretty.at(-1)}`;
  return (joined.charAt(0).toUpperCase() + joined.slice(1)).slice(0, 120);
}

export const DEFAULT_MEAL_TIMES: Record<"breakfast" | "lunch" | "dinner", string> = {
  breakfast: "07:15",
  lunch: "12:30",
  dinner: "19:00",
};

export function normalizeMealTime(value: string | undefined, mealType: "breakfast" | "lunch" | "dinner"): string {
  if (value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  return DEFAULT_MEAL_TIMES[mealType];
}
