import type { IngredientCategory, MealType } from "./household-types";

export type RecipeIngredient = {
  name: string;
  amount: number;
  unit: string;
  category: IngredientCategory;
};

export type Recipe = {
  id: string;
  title: string;
  mealType: MealType;
  prepMinutes: number;
  quick: boolean;
  servings: number;
  steps: string[];
  ingredients: RecipeIngredient[];
};

export const RECIPES: Recipe[] = [
  {
    id: "iogurte-granola",
    title: "Iogurte, fruta e granola",
    mealType: "breakfast",
    prepMinutes: 5,
    quick: true,
    servings: 2,
    steps: ["Divida o iogurte em duas tigelas.", "Cubra com banana e granola."],
    ingredients: [
      { name: "Iogurte natural", amount: 2, unit: "potes", category: "laticinios" },
      { name: "Banana", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Granola", amount: 80, unit: "g", category: "mercearia" },
    ],
  },
  {
    id: "pao-queijo-fruta",
    title: "Pão de queijo e fruta",
    mealType: "breakfast",
    prepMinutes: 8,
    quick: true,
    servings: 2,
    steps: ["Aqueça o pão de queijo.", "Sirva com fruta picada."],
    ingredients: [
      { name: "Pão de queijo", amount: 8, unit: "unidades", category: "laticinios" },
      { name: "Mamão", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "ovos-torrada",
    title: "Ovos mexidos e torrada",
    mealType: "breakfast",
    prepMinutes: 12,
    quick: true,
    servings: 2,
    steps: ["Bata os ovos com um pouco de leite.", "Mexa em fogo baixo e sirva nas torradas."],
    ingredients: [
      { name: "Ovos", amount: 4, unit: "unidades", category: "laticinios" },
      { name: "Pão integral", amount: 4, unit: "fatias", category: "mercearia" },
      { name: "Manteiga", amount: 15, unit: "g", category: "laticinios" },
    ],
  },
  {
    id: "vitamina-banana",
    title: "Vitamina de banana",
    mealType: "breakfast",
    prepMinutes: 5,
    quick: true,
    servings: 2,
    steps: ["Bata banana, leite e aveia até ficar cremoso."],
    ingredients: [
      { name: "Banana", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Leite", amount: 400, unit: "ml", category: "laticinios" },
      { name: "Aveia", amount: 40, unit: "g", category: "mercearia" },
    ],
  },
  {
    id: "cafe-completo",
    title: "Café completo",
    mealType: "breakfast",
    prepMinutes: 25,
    quick: false,
    servings: 2,
    steps: ["Prepare ovos, pão na chapa e fruta.", "Passe o café na hora."],
    ingredients: [
      { name: "Ovos", amount: 4, unit: "unidades", category: "laticinios" },
      { name: "Pão francês", amount: 4, unit: "unidades", category: "mercearia" },
      { name: "Queijo minas", amount: 120, unit: "g", category: "laticinios" },
      { name: "Café em grãos", amount: 30, unit: "g", category: "mercearia" },
    ],
  },
  {
    id: "panqueca-banana",
    title: "Panqueca de banana",
    mealType: "breakfast",
    prepMinutes: 20,
    quick: false,
    servings: 2,
    steps: ["Amasse a banana com ovo e aveia.", "Frite em frigideira antiaderente."],
    ingredients: [
      { name: "Banana", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Ovos", amount: 2, unit: "unidades", category: "laticinios" },
      { name: "Aveia", amount: 60, unit: "g", category: "mercearia" },
    ],
  },
  {
    id: "arroz-feijao-frango",
    title: "Arroz, feijão e frango grelhado",
    mealType: "lunch",
    prepMinutes: 35,
    quick: false,
    servings: 2,
    steps: ["Tempere e grelhe o frango.", "Sirva com arroz, feijão e salada."],
    ingredients: [
      { name: "Peito de frango", amount: 400, unit: "g", category: "carnes" },
      { name: "Arroz", amount: 200, unit: "g", category: "mercearia" },
      { name: "Feijão", amount: 200, unit: "g", category: "mercearia" },
      { name: "Alface", amount: 1, unit: "pé", category: "hortifruti" },
      { name: "Tomate", amount: 2, unit: "unidades", category: "hortifruti" },
    ],
  },
  {
    id: "carne-moida-batata",
    title: "Carne moída com batata",
    mealType: "lunch",
    prepMinutes: 30,
    quick: false,
    servings: 2,
    steps: ["Refogue a carne com alho e cebola.", "Acrescente batata em cubos até amaciar."],
    ingredients: [
      { name: "Carne moída", amount: 400, unit: "g", category: "carnes" },
      { name: "Batata", amount: 400, unit: "g", category: "hortifruti" },
      { name: "Cebola", amount: 1, unit: "unidade", category: "hortifruti" },
      { name: "Alho", amount: 3, unit: "dentes", category: "hortifruti" },
    ],
  },
  {
    id: "macarrao-molho",
    title: "Macarrão com molho caseiro",
    mealType: "lunch",
    prepMinutes: 20,
    quick: true,
    servings: 2,
    steps: ["Ferva o macarrão.", "Refogue tomate, alho e azeite e misture."],
    ingredients: [
      { name: "Macarrão", amount: 250, unit: "g", category: "mercearia" },
      { name: "Tomate", amount: 4, unit: "unidades", category: "hortifruti" },
      { name: "Alho", amount: 2, unit: "dentes", category: "hortifruti" },
      { name: "Azeite", amount: 20, unit: "ml", category: "mercearia" },
    ],
  },
  {
    id: "bife-arroz-feijao",
    title: "Arroz, feijão e bife",
    mealType: "lunch",
    prepMinutes: 35,
    quick: false,
    servings: 2,
    steps: ["Grelhe os bifes.", "Sirva com arroz, feijão e legumes."],
    ingredients: [
      { name: "Bife", amount: 400, unit: "g", category: "carnes" },
      { name: "Arroz", amount: 200, unit: "g", category: "mercearia" },
      { name: "Feijão", amount: 200, unit: "g", category: "mercearia" },
      { name: "Brócolis", amount: 1, unit: "maço", category: "hortifruti" },
    ],
  },
  {
    id: "frango-salada",
    title: "Frango grelhado e salada",
    mealType: "lunch",
    prepMinutes: 20,
    quick: true,
    servings: 2,
    steps: ["Grelhe o frango em fatias finas.", "Monte a salada e tempere na hora."],
    ingredients: [
      { name: "Peito de frango", amount: 350, unit: "g", category: "carnes" },
      { name: "Alface", amount: 1, unit: "pé", category: "hortifruti" },
      { name: "Tomate", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Pepino", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "strogonoff-frango",
    title: "Strogonoff de frango",
    mealType: "lunch",
    prepMinutes: 35,
    quick: false,
    servings: 2,
    steps: ["Refogue o frango.", "Adicione creme de leite e molho e sirva com arroz."],
    ingredients: [
      { name: "Peito de frango", amount: 400, unit: "g", category: "carnes" },
      { name: "Creme de leite", amount: 200, unit: "g", category: "laticinios" },
      { name: "Molho de tomate", amount: 200, unit: "g", category: "mercearia" },
      { name: "Arroz", amount: 200, unit: "g", category: "mercearia" },
    ],
  },
  {
    id: "lasanha-salada",
    title: "Lasanha e salada",
    mealType: "lunch",
    prepMinutes: 50,
    quick: false,
    servings: 2,
    steps: ["Monte a lasanha em camadas.", "Asse e sirva com folhas verdes."],
    ingredients: [
      { name: "Massa de lasanha", amount: 250, unit: "g", category: "mercearia" },
      { name: "Carne moída", amount: 300, unit: "g", category: "carnes" },
      { name: "Queijo mussarela", amount: 200, unit: "g", category: "laticinios" },
      { name: "Molho de tomate", amount: 400, unit: "g", category: "mercearia" },
      { name: "Alface", amount: 1, unit: "pé", category: "hortifruti" },
    ],
  },
  {
    id: "wrap-frango",
    title: "Wrap de frango e salada",
    mealType: "dinner",
    prepMinutes: 15,
    quick: true,
    servings: 2,
    steps: ["Recheie as tortillas com frango desfiado e folhas.", "Enrole e sirva na hora."],
    ingredients: [
      { name: "Tortilla", amount: 4, unit: "unidades", category: "mercearia" },
      { name: "Peito de frango", amount: 250, unit: "g", category: "carnes" },
      { name: "Alface", amount: 1, unit: "pé", category: "hortifruti" },
      { name: "Tomate", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "omelete-forno",
    title: "Omelete de forno",
    mealType: "dinner",
    prepMinutes: 18,
    quick: true,
    servings: 2,
    steps: ["Misture ovos, queijo e legumes.", "Asse até dourar."],
    ingredients: [
      { name: "Ovos", amount: 4, unit: "unidades", category: "laticinios" },
      { name: "Queijo mussarela", amount: 80, unit: "g", category: "laticinios" },
      { name: "Tomate", amount: 1, unit: "unidade", category: "hortifruti" },
      { name: "Espinafre", amount: 1, unit: "maço", category: "hortifruti" },
    ],
  },
  {
    id: "sopa-legumes",
    title: "Sopa de legumes",
    mealType: "dinner",
    prepMinutes: 30,
    quick: false,
    servings: 2,
    steps: ["Refogue cebola e alho.", "Cozinhe os legumes até ficarem macios e amasse um pouco."],
    ingredients: [
      { name: "Batata", amount: 300, unit: "g", category: "hortifruti" },
      { name: "Cenoura", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Abóbora", amount: 300, unit: "g", category: "hortifruti" },
      { name: "Cebola", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "cuscuz-ovos",
    title: "Cuscuz com ovos",
    mealType: "dinner",
    prepMinutes: 12,
    quick: true,
    servings: 2,
    steps: ["Hidrate o floco de milho.", "Cozinhe no cuscuzeiro e sirva com ovos."],
    ingredients: [
      { name: "Flocão de milho", amount: 200, unit: "g", category: "mercearia" },
      { name: "Ovos", amount: 4, unit: "unidades", category: "laticinios" },
      { name: "Manteiga", amount: 15, unit: "g", category: "laticinios" },
    ],
  },
  {
    id: "sanduiche-natural",
    title: "Sanduíche natural",
    mealType: "dinner",
    prepMinutes: 8,
    quick: true,
    servings: 2,
    steps: ["Monte o pão com frango desfiado, queijo e folhas."],
    ingredients: [
      { name: "Pão integral", amount: 4, unit: "fatias", category: "mercearia" },
      { name: "Peito de frango", amount: 150, unit: "g", category: "carnes" },
      { name: "Queijo minas", amount: 80, unit: "g", category: "laticinios" },
      { name: "Alface", amount: 0.5, unit: "pé", category: "hortifruti" },
    ],
  },
  {
    id: "pizza-frigideira",
    title: "Pizza de frigideira",
    mealType: "dinner",
    prepMinutes: 15,
    quick: true,
    servings: 2,
    steps: ["Use pão sírio como base.", "Cubra com molho e queijo e sele na frigideira."],
    ingredients: [
      { name: "Pão sírio", amount: 2, unit: "unidades", category: "mercearia" },
      { name: "Molho de tomate", amount: 120, unit: "g", category: "mercearia" },
      { name: "Queijo mussarela", amount: 150, unit: "g", category: "laticinios" },
      { name: "Tomate", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "caldo-torradas",
    title: "Caldo com torradas",
    mealType: "dinner",
    prepMinutes: 28,
    quick: false,
    servings: 2,
    steps: ["Cozinhe legumes e bata parte do caldo.", "Sirva com torradas crocantes."],
    ingredients: [
      { name: "Mandioca", amount: 400, unit: "g", category: "hortifruti" },
      { name: "Cebola", amount: 1, unit: "unidade", category: "hortifruti" },
      { name: "Pão italiano", amount: 4, unit: "fatias", category: "mercearia" },
    ],
  },
  {
    id: "tapioca-queijo",
    title: "Tapioca com queijo",
    mealType: "breakfast",
    prepMinutes: 8,
    quick: true,
    servings: 2,
    steps: ["Hidrate a goma.", "Recheie com queijo e dobre na frigideira."],
    ingredients: [
      { name: "Goma de tapioca", amount: 160, unit: "g", category: "mercearia" },
      { name: "Queijo minas", amount: 120, unit: "g", category: "laticinios" },
      { name: "Manteiga", amount: 10, unit: "g", category: "laticinios" },
    ],
  },
  {
    id: "mingau-aveia",
    title: "Mingau de aveia",
    mealType: "breakfast",
    prepMinutes: 10,
    quick: true,
    servings: 2,
    steps: ["Aqueça o leite com a aveia.", "Sirva com banana amassada."],
    ingredients: [
      { name: "Aveia", amount: 80, unit: "g", category: "mercearia" },
      { name: "Leite", amount: 500, unit: "ml", category: "laticinios" },
      { name: "Banana", amount: 2, unit: "unidades", category: "hortifruti" },
    ],
  },
  {
    id: "escondidinho-carne",
    title: "Escondidinho de carne",
    mealType: "lunch",
    prepMinutes: 40,
    quick: false,
    servings: 2,
    steps: ["Cozinhe e amasse a mandioca.", "Refogue a carne e monte com queijo no forno."],
    ingredients: [
      { name: "Mandioca", amount: 500, unit: "g", category: "hortifruti" },
      { name: "Carne moída", amount: 350, unit: "g", category: "carnes" },
      { name: "Queijo mussarela", amount: 150, unit: "g", category: "laticinios" },
      { name: "Cebola", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "arroz-forno",
    title: "Arroz de forno",
    mealType: "lunch",
    prepMinutes: 40,
    quick: false,
    servings: 2,
    steps: ["Misture o arroz com frango e molho.", "Cubra com queijo e leve ao forno."],
    ingredients: [
      { name: "Arroz", amount: 250, unit: "g", category: "mercearia" },
      { name: "Peito de frango", amount: 300, unit: "g", category: "carnes" },
      { name: "Molho de tomate", amount: 200, unit: "g", category: "mercearia" },
      { name: "Queijo mussarela", amount: 150, unit: "g", category: "laticinios" },
    ],
  },
  {
    id: "yakissoba-frango",
    title: "Yakissoba de frango",
    mealType: "lunch",
    prepMinutes: 25,
    quick: false,
    servings: 2,
    steps: ["Refogue o frango e os legumes.", "Misture o macarrão e acerte o sal."],
    ingredients: [
      { name: "Macarrão", amount: 250, unit: "g", category: "mercearia" },
      { name: "Peito de frango", amount: 300, unit: "g", category: "carnes" },
      { name: "Brócolis", amount: 1, unit: "maço", category: "hortifruti" },
      { name: "Cenoura", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
  {
    id: "macarrao-alho-oleo",
    title: "Macarrão alho e óleo",
    mealType: "dinner",
    prepMinutes: 12,
    quick: true,
    servings: 2,
    steps: ["Ferva o macarrão.", "Refogue o alho no azeite e misture."],
    ingredients: [
      { name: "Macarrão", amount: 250, unit: "g", category: "mercearia" },
      { name: "Alho", amount: 4, unit: "dentes", category: "hortifruti" },
      { name: "Azeite", amount: 30, unit: "ml", category: "mercearia" },
    ],
  },
  {
    id: "panqueca-frango",
    title: "Panqueca de frango",
    mealType: "dinner",
    prepMinutes: 25,
    quick: false,
    servings: 2,
    steps: ["Faça a massa com ovos.", "Recheie com frango, cubra com molho e queijo."],
    ingredients: [
      { name: "Ovos", amount: 3, unit: "unidades", category: "laticinios" },
      { name: "Peito de frango", amount: 250, unit: "g", category: "carnes" },
      { name: "Molho de tomate", amount: 200, unit: "g", category: "mercearia" },
      { name: "Queijo mussarela", amount: 120, unit: "g", category: "laticinios" },
    ],
  },
  {
    id: "sopa-frango",
    title: "Sopa de frango",
    mealType: "dinner",
    prepMinutes: 30,
    quick: false,
    servings: 2,
    steps: ["Cozinhe o frango com os legumes.", "Desfie a carne e acerte o sal."],
    ingredients: [
      { name: "Peito de frango", amount: 300, unit: "g", category: "carnes" },
      { name: "Batata", amount: 300, unit: "g", category: "hortifruti" },
      { name: "Cenoura", amount: 2, unit: "unidades", category: "hortifruti" },
      { name: "Cebola", amount: 1, unit: "unidade", category: "hortifruti" },
    ],
  },
];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Jantar",
};

export const MEAL_SHORT: Record<MealType, string> = {
  breakfast: "Café",
  lunch: "Almoço",
  dinner: "Jantar",
};

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  hortifruti: "Hortifruti",
  mercearia: "Mercearia",
  carnes: "Carnes",
  laticinios: "Laticínios",
  outros: "Outros",
};

export function recipesFor(mealType: MealType, maxMinutes?: number): Recipe[] {
  return RECIPES.filter(
    (recipe) =>
      recipe.mealType === mealType &&
      (maxMinutes === undefined || recipe.prepMinutes <= maxMinutes),
  );
}

export function getRecipe(id: string | null | undefined): Recipe | undefined {
  if (!id) return undefined;
  return RECIPES.find((recipe) => recipe.id === id);
}

export function ingredientKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

export function formatQuantity(amount: number, unit: string): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(".", ",");
  return `${rounded} ${unit}`;
}
