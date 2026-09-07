import { Clock3, CookingPot } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { getBootstrap } from "@/lib/server/bootstrap";
import { redirect } from "next/navigation";

const weekMenu = [
  {
    day: "Segunda",
    date: "7 set",
    meals: ["Pão de queijo e fruta", "Frango, arroz e legumes", "Omelete de forno"],
    quick: [true, false, true],
  },
  {
    day: "Terça",
    date: "8 set",
    meals: ["Iogurte e granola", "Carne moída com batata", "Wrap de frango"],
    quick: [true, false, true],
  },
  {
    day: "Quarta",
    date: "9 set",
    meals: ["Ovos mexidos e torrada", "Macarrão com molho caseiro", "Sopa de legumes"],
    quick: [true, true, false],
  },
  {
    day: "Quinta",
    date: "10 set",
    meals: ["Vitamina de banana", "Arroz, feijão e bife", "Cuscuz com ovos"],
    quick: [true, false, true],
  },
  {
    day: "Sexta",
    date: "11 set",
    meals: ["Iogurte, fruta e granola", "Frango grelhado e salada", "Sanduíche natural"],
    quick: [true, false, true],
  },
  {
    day: "Sábado",
    date: "12 set",
    meals: ["Panqueca de banana", "Strogonoff de frango", "Pizza de frigideira"],
    quick: [false, false, true],
  },
  {
    day: "Domingo",
    date: "13 set",
    meals: ["Café completo", "Lasanha e salada", "Caldo com torradas"],
    quick: [false, false, false],
  },
] as const;

const mealLabels = ["Café", "Almoço", "Jantar"] as const;

export default async function MealsPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "needs-space") redirect("/comecar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/comidas" />;
  return (
    <AppShell currentPath="/comidas" user={state.bootstrap.user} space={state.bootstrap.space}>
      <section className="collection-view collection-view--wide" aria-labelledby="meals-title">
        <header className="collection-heading">
          <div>
            <p className="eyebrow">PLANEJAMENTO LEVE</p>
            <h1 id="meals-title">Cardápio da semana</h1>
            <p>Refeições simples, com opções rápidas nos dias de faculdade.</p>
          </div>
          <span className="collection-count">
            <CookingPot size={16} aria-hidden="true" />
            3 refeições por dia
          </span>
        </header>

        <ul className="meal-week" aria-label="Refeições da semana">
          {weekMenu.map((day) => (
            <li className="meal-day" key={day.date}>
              <div className="meal-day-label">
                <strong>{day.day}</strong>
                <span>{day.date}</span>
              </div>
              {day.meals.map((meal, index) => (
                <div className="meal-slot" key={meal}>
                  <span className="meal-label">{mealLabels[index]}</span>
                  <strong>{meal}</strong>
                  {day.quick[index] ? (
                    <small>
                      <Clock3 size={12} aria-hidden="true" />
                      Rápida
                    </small>
                  ) : null}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
