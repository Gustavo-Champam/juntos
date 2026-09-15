"use client";

import { CalendarCheck2, MapPin, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { addCivilDays, civilToday, formatDayMonth, formatWeekdayShort, startOfWeek } from "@/lib/dates";
import { household } from "@/lib/household-client";

type Member = { id: string; name: string };
type Occurrence = {
  occurrenceId: string;
  date: string;
  startsAt: string;
  event: {
    id: string;
    title: string;
    time: string;
    date?: string;
    location: string;
    notes?: string;
    durationMinutes?: number;
    version: number;
    assigneeId: string | null;
    recurrence?: { frequency: "weekly"; until: string | null } | null;
  };
};

type Draft = {
  id?: string;
  version?: number;
  title: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  durationMinutes: number;
  assigneeId: string;
  weekly: boolean;
};

function emptyDraft(today: string): Draft {
  return {
    title: "",
    date: today,
    time: "19:00",
    location: "",
    notes: "",
    durationMinutes: 60,
    assigneeId: "",
    weekly: false,
  };
}

export function AgendaBoard() {
  const today = civilToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [items, setItems] = useState<Occurrence[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [error, setError] = useState("");
  const weekEnd = addCivilDays(weekStart, 6);

  const load = useCallback(async () => {
    try {
      const result = (await household.agenda(weekStart, weekEnd)) as {
        snapshot?: { occurrences: Occurrence[]; members: Member[] };
      };
      setItems(result.snapshot?.occurrences ?? []);
      setMembers(result.snapshot?.members ?? []);
      setError("");
    } catch {
      setError("Não foi possível abrir a agenda.");
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  function eventPayload(current: Draft) {
    return {
      title: current.title.trim(),
      date: current.date,
      time: current.time,
      durationMinutes: current.durationMinutes || 60,
      location: current.location.trim(),
      notes: current.notes.trim(),
      assigneeId: current.assigneeId || null,
      recurrence: current.weekly ? { frequency: "weekly", until: null } : null,
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      if (draft.id && draft.version) {
        await household.updateAgenda(draft.id, draft.version, eventPayload(draft));
      } else {
        await household.createAgenda(eventPayload(draft));
      }
      setDraft(emptyDraft(today));
      await load();
    } catch {
      setError("Não deu para salvar o compromisso.");
    }
  }

  async function remove(item: Occurrence) {
    try {
      await household.deleteAgenda(item.event.id, item.event.version);
      if (draft.id === item.event.id) setDraft(emptyDraft(today));
      await load();
    } catch {
      setError("Não deu para apagar.");
    }
  }

  function edit(item: Occurrence) {
    setDraft({
      id: item.event.id,
      version: item.event.version,
      title: item.event.title,
      date: item.date,
      time: item.event.time,
      location: item.event.location,
      notes: item.event.notes ?? "",
      durationMinutes: item.event.durationMinutes ?? 60,
      assigneeId: item.event.assigneeId ?? "",
      weekly: item.event.recurrence?.frequency === "weekly",
    });
  }

  return (
    <section className="collection-view" aria-labelledby="agenda-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Próximos dias</p>
          <h1 id="agenda-title">Agenda da semana</h1>
          <p>Criar, editar, repetir toda semana e dizer quem vai.</p>
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

      <form className="identity-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="event-title">{draft.id ? "Editar compromisso" : "Novo compromisso"}</label>
        <input id="event-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
        <label htmlFor="event-date">Dia</label>
        <input id="event-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
        <label htmlFor="event-time">Hora</label>
        <input id="event-time" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} required />
        <label htmlFor="event-duration">Duração (min)</label>
        <input
          id="event-duration"
          type="number"
          min={15}
          max={480}
          step={15}
          value={draft.durationMinutes}
          onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) || 60 })}
        />
        <label htmlFor="event-place">Onde</label>
        <input id="event-place" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        <label htmlFor="event-who">Quem vai</label>
        <select id="event-who" value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
          <option value="">Ambos</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
        <label className="check-inline">
          <input type="checkbox" checked={draft.weekly} onChange={(event) => setDraft({ ...draft, weekly: event.target.checked })} />
          Repetir toda semana
        </label>
        <div className="form-actions">
          <button className="identity-action" type="submit">{draft.id ? "Salvar" : "Adicionar"}</button>
          {draft.id ? (
            <button className="quiet-button" type="button" onClick={() => setDraft(emptyDraft(today))}>Cancelar</button>
          ) : null}
        </div>
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
                  <UsersRound size={14} aria-hidden="true" />
                  {item.event.assigneeId
                    ? members.find((member) => member.id === item.event.assigneeId)?.name ?? "Alguém"
                    : "Ambos"}
                </span>
                {item.event.location ? (
                  <span>
                    <MapPin size={14} aria-hidden="true" /> {item.event.location}
                  </span>
                ) : null}
                {item.event.recurrence?.frequency === "weekly" ? <span>Toda semana</span> : null}
              </p>
              <div className="slot-actions">
                <button type="button" className="quiet-button" onClick={() => edit(item)}>Editar</button>
                <button type="button" className="quiet-button" onClick={() => void remove(item)}>Apagar</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
