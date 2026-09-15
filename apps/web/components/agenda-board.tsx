"use client";

import { CalendarCheck2, MapPin, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/dates";
import { household } from "@/lib/household-client";

type Occurrence = {
  occurrenceId: string;
  date: string;
  startsAt: string;
  event: {
    id: string;
    title: string;
    time: string;
    location: string;
    version: number;
    assigneeId: string | null;
  };
};

export function AgendaBoard() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [items, setItems] = useState<Occurrence[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("19:00");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const weekEnd = addCivilDays(weekStart, 6);

  const load = useCallback(async () => {
    try {
      const result = (await household.agenda(weekStart, weekEnd)) as {
        changed: boolean;
        snapshot?: { occurrences: Occurrence[] };
      };
      setItems(result.snapshot?.occurrences ?? []);
      setError("");
    } catch {
      setError("Não foi possível abrir a agenda.");
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await household.createAgenda({
        title: title.trim(),
        date,
        time,
        durationMinutes: 60,
        location: location.trim(),
        notes: "",
        assigneeId: null,
        recurrence: null,
      });
      setTitle("");
      setLocation("");
      await load();
    } catch {
      setError("Não deu para criar o compromisso.");
    }
  }

  async function remove(item: Occurrence) {
    try {
      await household.deleteAgenda(item.event.id, item.event.version);
      await load();
    } catch {
      setError("Não deu para apagar.");
    }
  }

  return (
    <section className="collection-view" aria-labelledby="agenda-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Próximos dias</p>
          <h1 id="agenda-title">Agenda da semana</h1>
          <p>Compromissos dos dois, numa ordem só.</p>
        </div>
        <span className="collection-count">
          <CalendarCheck2 size={16} aria-hidden="true" />
          {items.length} compromissos
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls" aria-label="Semana">
          <button type="button" onClick={() => setWeekStart((value) => addCivilDays(value, -7))}>‹</button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(today))}>Esta semana</button>
          <button type="button" onClick={() => setWeekStart((value) => addCivilDays(value, 7))}>›</button>
        </div>
        <p className="toolbar-label">{formatDayMonth(weekStart)} — {formatDayMonth(weekEnd)}</p>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      <form className="identity-form" onSubmit={(event) => void create(event)}>
        <label htmlFor="event-title">Novo compromisso</label>
        <input id="event-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <label htmlFor="event-date">Dia</label>
        <input id="event-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        <label htmlFor="event-time">Hora</label>
        <input id="event-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
        <label htmlFor="event-place">Onde</label>
        <input id="event-place" value={location} onChange={(event) => setLocation(event.target.value)} />
        <button className="identity-action" type="submit">Adicionar</button>
      </form>

      <ol className="agenda-list" aria-label="Compromissos da semana">
        {items.map((item) => (
          <li className="agenda-row" key={item.occurrenceId}>
            <div className="agenda-date">
              <strong>{formatWeekdayShort(item.date)}</strong>
              <span>{formatDayMonth(item.date)}</span>
            </div>
            <time dateTime={item.startsAt}>{item.event.time}</time>
            <div className="agenda-copy">
              <h2>{item.event.title}</h2>
              <p>
                <span>
                  <UsersRound size={14} aria-hidden="true" /> Ambos
                </span>
                {item.event.location ? (
                  <span>
                    <MapPin size={14} aria-hidden="true" /> {item.event.location}
                  </span>
                ) : null}
              </p>
              <button type="button" className="quiet-button" onClick={() => void remove(item)}>
                Apagar
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
