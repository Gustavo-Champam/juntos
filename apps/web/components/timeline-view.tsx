"use client";

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

import { buildTimeline } from "@/features/timeline/build-timeline";
import type {
  CalendarEvent,
  MealType,
  PlannedMeal,
  TimelineItem,
} from "@/features/timeline/types";

type TimelineViewProps = {
  initialDate: string;
  events: readonly CalendarEvent[];
  meals: readonly PlannedMeal[];
};

const mealLabels: Record<MealType, string> = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Jantar",
};

const mealIcons = {
  breakfast: Coffee,
  lunch: Salad,
  dinner: CookingPot,
} as const;

function formatDateTitle(date: string): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function shiftDate(date: string, amount: number): string {
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + amount);

  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(startsAt: string): string {
  return startsAt.slice(11, 16);
}

function TimelineMeta({ item }: Readonly<{ item: TimelineItem }>) {
  if (item.kind === "meal") {
    return (
      <div className="timeline-meta">
        {item.prepMinutes ? (
          <span>{item.prepMinutes} min de preparo</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="timeline-meta">
      <span>
        <UsersRound size={14} aria-hidden="true" /> {item.owner}
      </span>
      {item.location ? (
        <span>
          <MapPin size={14} aria-hidden="true" /> {item.location}
        </span>
      ) : null}
    </div>
  );
}

function TimelineIcon({ item }: Readonly<{ item: TimelineItem }>) {
  if (item.kind === "event") {
    return <BriefcaseBusiness size={19} strokeWidth={1.8} aria-hidden="true" />;
  }

  const Icon = mealIcons[item.mealType];
  return <Icon size={19} strokeWidth={1.8} aria-hidden="true" />;
}

export function TimelineView({
  initialDate,
  events,
  meals,
}: Readonly<TimelineViewProps>) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const timeline = useMemo(
    () => buildTimeline({ date: selectedDate, events, meals }),
    [events, meals, selectedDate],
  );

  return (
    <section className="day-view" aria-labelledby="day-title">
      <div className="day-heading">
        <div>
          <p className="eyebrow">A rotina de vocês</p>
          <h1 id="day-title" aria-live="polite">
            {formatDateTitle(selectedDate)}
          </h1>
          <p className="day-subtitle">
            Tudo em ordem, do primeiro café ao fim da noite.
          </p>
        </div>

        <div className="day-controls" aria-label="Escolher dia">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSelectedDate(initialDate)}>
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próximo dia"
            onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {timeline.length > 0 ? (
        <ol className="timeline-list" aria-label="Rotina do dia">
          {timeline.map((item) => (
            <li className={`timeline-row timeline-row--${item.kind}`} key={item.id}>
              <time className="timeline-time" dateTime={item.startsAt}>
                {formatTime(item.startsAt)}
              </time>
              <span className="timeline-rail" aria-hidden="true">
                <span className="timeline-dot">
                  <TimelineIcon item={item} />
                </span>
              </span>
              <article className="timeline-card">
                <div className="timeline-card-topline">
                  <span className="timeline-kind">
                    {item.kind === "meal" ? mealLabels[item.mealType] : "Compromisso"}
                  </span>
                  {item.kind === "meal" && item.quick ? (
                    <span className="quick-badge">
                      <Sparkles size={13} aria-hidden="true" /> Rápida
                    </span>
                  ) : null}
                </div>
                <h2>{item.title}</h2>
                <TimelineMeta item={item} />
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-day">
          <span aria-hidden="true">
            <Clock3 size={22} />
          </span>
          <div>
            <h2>Dia livre por enquanto</h2>
            <p>Quando vocês adicionarem algo, ele aparece aqui na hora certa.</p>
          </div>
        </div>
      )}

      <button className="add-button" type="button" aria-label="Adicionar à rotina">
        <Plus size={20} aria-hidden="true" />
        <span>Adicionar</span>
      </button>
    </section>
  );
}
