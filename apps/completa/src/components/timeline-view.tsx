import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  CookingPot,
  MapPin,
  Plus,
  Salad,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { listAgenda } from "@/lib/agenda";
import { addCivilDays, civilToday, formatDayTitle } from "@/lib/civil";
import { listMeals } from "@/lib/meals";
import { MEAL_LABELS } from "@/lib/recipes";
import type { AgendaOccurrence, MealType, PlannedMeal, SpaceMember } from "@/lib/types";

function ownerLabel(occurrence: AgendaOccurrence, members: SpaceMember[]): string {
  if (!occurrence.event.assigneeId) return "Nós dois";
  return members.find((member) => member.id === occurrence.event.assigneeId)?.name ?? "Ex-integrante";
}

function formatTime(startsAt: string): string {
  return startsAt.slice(11, 16);
}

const mealIcons = {
  breakfast: Coffee,
  lunch: Salad,
  dinner: CookingPot,
} as const;

type TimelineRow =
  | { kind: "event"; id: string; startsAt: string; occurrence: AgendaOccurrence }
  | { kind: "meal"; id: string; startsAt: string; meal: PlannedMeal };

export function TimelineView() {
  const [selectedDate, setSelectedDate] = useState(civilToday);
  const today = civilToday();
  const navigate = useNavigate();
  const from = addCivilDays(selectedDate, -1);
  const to = selectedDate;

  const agendaQuery = useQuery({
    queryKey: ["agenda", from, to],
    queryFn: () => listAgenda({ data: { from, to } }),
  });
  const mealsQuery = useQuery({
    queryKey: ["meals", selectedDate, selectedDate],
    queryFn: () => listMeals({ data: { from: selectedDate, to: selectedDate } }),
  });

  const rows = useMemo<TimelineRow[]>(() => {
    const members = agendaQuery.data?.members ?? [];
    void members;
    const events = (agendaQuery.data?.occurrences ?? [])
      .filter((occurrence) => {
        const dayStart = `${selectedDate}T00:00:00-03:00`;
        const dayEnd = `${addCivilDays(selectedDate, 1)}T00:00:00-03:00`;
        return occurrence.startsAt < dayEnd && occurrence.endsAt > dayStart;
      })
      .map((occurrence) => ({
        kind: "event" as const,
        id: occurrence.occurrenceId,
        startsAt: occurrence.startsAt,
        occurrence,
      }));
    const meals = (mealsQuery.data ?? []).map((meal) => ({
      kind: "meal" as const,
      id: meal.id,
      startsAt: mealTime(meal.date, meal.mealType),
      meal,
    }));
    return [...events, ...meals].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [agendaQuery.data, mealsQuery.data, selectedDate]);

  const members = agendaQuery.data?.members ?? [];
  const loading = agendaQuery.isPending || mealsQuery.isPending;

  return (
    <section className="day-view" aria-labelledby="day-title">
      <div className="day-heading">
        <div>
          <p className="eyebrow">A rotina de vocês</p>
          <h1 id="day-title" aria-live="polite">
            {formatDayTitle(selectedDate)}
          </h1>
          <p className="day-subtitle">Tudo em ordem, do primeiro café ao fim da noite.</p>
        </div>
        <div className="day-controls" aria-label="Escolher dia">
          <button type="button" aria-label="Dia anterior" onClick={() => setSelectedDate((d) => addCivilDays(d, -1))}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSelectedDate(today)}>
            Hoje
          </button>
          <button type="button" aria-label="Próximo dia" onClick={() => setSelectedDate((d) => addCivilDays(d, 1))}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="day-subtitle">Carregando a rotina do dia…</p>
      ) : rows.length > 0 ? (
        <ol className="timeline-list" aria-label="Rotina do dia">
          {rows.map((row) =>
            row.kind === "event" ? (
              <li className="timeline-row timeline-row--event" key={row.id}>
                <time className="timeline-time" dateTime={row.startsAt}>
                  {formatTime(row.startsAt)}
                </time>
                <span className="timeline-rail" aria-hidden="true">
                  <span className="timeline-dot">
                    <BriefcaseBusiness size={19} strokeWidth={1.8} />
                  </span>
                </span>
                <article className="timeline-card">
                  <div className="timeline-card-topline">
                    <span className="timeline-kind">Compromisso</span>
                  </div>
                  <h2>{row.occurrence.event.title}</h2>
                  <div className="timeline-meta">
                    <span>
                      <UsersRound size={14} aria-hidden="true" /> {ownerLabel(row.occurrence, members)}
                    </span>
                    {row.occurrence.event.location ? (
                      <span>
                        <MapPin size={14} aria-hidden="true" /> {row.occurrence.event.location}
                      </span>
                    ) : null}
                  </div>
                </article>
              </li>
            ) : (
              <li className="timeline-row timeline-row--meal" key={row.id}>
                <time className="timeline-time" dateTime={row.startsAt}>
                  {formatTime(row.startsAt)}
                </time>
                <span className="timeline-rail" aria-hidden="true">
                  <span className="timeline-dot">
                    {(() => {
                      const Icon = mealIcons[row.meal.mealType];
                      return <Icon size={19} strokeWidth={1.8} />;
                    })()}
                  </span>
                </span>
                <article className="timeline-card">
                  <div className="timeline-card-topline">
                    <span className="timeline-kind">{MEAL_LABELS[row.meal.mealType]}</span>
                    {row.meal.quick ? (
                      <span className="quick-badge">
                        <Sparkles size={13} aria-hidden="true" /> Rápida
                      </span>
                    ) : null}
                  </div>
                  <h2>{row.meal.title}</h2>
                  <div className="timeline-meta">
                    {row.meal.prepMinutes ? <span>{row.meal.prepMinutes} min de preparo</span> : null}
                  </div>
                </article>
              </li>
            ),
          )}
        </ol>
      ) : (
        <div className="empty-day">
          <span aria-hidden="true">
            <Clock3 size={22} />
          </span>
          <div>
            <h2>Dia livre por enquanto</h2>
            <p>Quando vocês adicionarem um compromisso ou uma refeição, ele aparece aqui na hora certa.</p>
          </div>
        </div>
      )}

      <button
        className="add-button"
        type="button"
        aria-label="Adicionar compromisso"
        onClick={() => navigate({ to: "/agenda", search: { new: "1" } })}
      >
        <Plus size={20} aria-hidden="true" />
        <span>Adicionar</span>
      </button>
      <p className="visually-hidden">
        <Link to="/comidas">Ir para o cardápio</Link>
      </p>
    </section>
  );
}

function mealTime(date: string, mealType: MealType): string {
  const clock = mealType === "breakfast" ? "07:30" : mealType === "lunch" ? "12:30" : "19:30";
  return `${date}T${clock}:00-03:00`;
}
