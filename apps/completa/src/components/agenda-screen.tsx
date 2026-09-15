import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, MapPin, Plus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { createAgendaEvent, deleteAgendaEvent, listAgenda, updateAgendaEvent } from "@/lib/agenda";
import {
  addCivilDays,
  civilToday,
  formatDayMonth,
  formatMonthYear,
  formatWeekdayShort,
  startOfWeek,
  weekday,
} from "@/lib/civil";
import type { AgendaEvent, AgendaFields, AgendaOccurrence } from "@/lib/types";
import { EventForm } from "./event-form";

type ViewMode = "month" | "week" | "list";

function ownerName(occurrence: AgendaOccurrence, members: { id: string; name: string }[]) {
  if (!occurrence.event.assigneeId) return "Nós dois";
  return members.find((member) => member.id === occurrence.event.assigneeId)?.name ?? "Ex-integrante";
}

export function AgendaScreen({ openNew }: { openNew: boolean }) {
  const today = civilToday();
  const [cursor, setCursor] = useState(today);
  const [view, setView] = useState<ViewMode>("list");
  const [editing, setEditing] = useState<AgendaEvent | null | "new">(openNew ? "new" : null);
  const queryClient = useQueryClient();

  const range = useMemo(() => {
    if (view === "month") {
      const first = `${cursor.slice(0, 8)}01`;
      const gridStart = addCivilDays(first, 1 - weekday(first));
      return { from: gridStart, to: addCivilDays(gridStart, 41) };
    }
    const from = startOfWeek(cursor);
    return { from, to: addCivilDays(from, 6) };
  }, [cursor, view]);

  const query = useQuery({
    queryKey: ["agenda", range.from, range.to],
    queryFn: () => listAgenda({ data: range }),
  });

  const occurrences = query.data?.occurrences ?? [];
  const members = query.data?.members ?? [];

  const saveMutation = useMutation({
    mutationFn: async (fields: AgendaFields) => {
      if (editing && editing !== "new") {
        return updateAgendaEvent({
          data: { id: editing.id, expectedVersion: editing.version, event: fields },
        });
      }
      return createAgendaEvent({ data: fields });
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["agenda"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editing || editing === "new") return;
      await deleteAgendaEvent({ data: { id: editing.id, expectedVersion: editing.version } });
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["agenda"] });
    },
  });

  if (editing !== null) {
    return (
      <section className="collection-view">
        <EventForm
          event={editing === "new" ? null : editing}
          defaultDate={cursor}
          members={members}
          onSave={async (fields) => {
            await saveMutation.mutateAsync(fields);
          }}
          onDelete={editing === "new" ? undefined : () => deleteMutation.mutateAsync()}
          onCancel={() => setEditing(null)}
        />
      </section>
    );
  }

  const monthCells =
    view === "month"
      ? Array.from({ length: 42 }, (_, index) => addCivilDays(range.from, index))
      : [];

  return (
    <section className="collection-view" aria-labelledby="agenda-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">A rotina compartilhada</p>
          <h1 id="agenda-title">Agenda</h1>
          <p>Compromissos dos dois, com repetição semanal quando fizer sentido.</p>
        </div>
        <span className="collection-count">
          <CalendarCheck2 size={16} aria-hidden="true" />
          {occurrences.length} neste período
        </span>
      </header>

      <div className="toolbar">
        <div className="day-controls" aria-label="Período">
          <button type="button" onClick={() => setCursor((d) => addCivilDays(d, view === "month" ? -28 : -7))}>
            ‹
          </button>
          <button type="button" onClick={() => setCursor(today)}>
            Hoje
          </button>
          <button type="button" onClick={() => setCursor((d) => addCivilDays(d, view === "month" ? 28 : 7))}>
            ›
          </button>
        </div>
        <p className="toolbar-label">{view === "month" ? formatMonthYear(cursor) : `${formatDayMonth(range.from)} — ${formatDayMonth(range.to)}`}</p>
        <div className="view-toggle" role="tablist" aria-label="Visualização">
          {(["list", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              className={view === mode ? "is-active" : undefined}
              onClick={() => setView(mode)}
            >
              {mode === "list" ? "Lista" : mode === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? <p className="day-subtitle">Carregando a agenda…</p> : null}
      {query.isError ? (
        <p role="alert" className="form-alert">
          Não foi possível carregar os compromissos.
        </p>
      ) : null}

      {view === "month" ? (
        <div className="month-grid" role="grid" aria-label="Calendário do mês">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => (
            <div className="month-weekday" key={label}>
              {label}
            </div>
          ))}
          {monthCells.map((date) => {
            const dayItems = occurrences.filter((item) => item.date === date);
            return (
              <button
                type="button"
                className={`month-cell ${date === today ? "is-today" : ""} ${date.slice(0, 7) !== cursor.slice(0, 7) ? "is-muted" : ""}`}
                key={date}
                onClick={() => {
                  setCursor(date);
                  setView("list");
                }}
              >
                <strong>{Number(date.slice(8))}</strong>
                {dayItems.slice(0, 2).map((item) => (
                  <span key={item.occurrenceId}>{item.event.title}</span>
                ))}
              </button>
            );
          })}
        </div>
      ) : occurrences.length === 0 ? (
        <div className="empty-day">
          <div>
            <h2>Nenhum compromisso neste período</h2>
            <p>O primeiro horário que vocês combinarem aparece para os dois aparelhos.</p>
          </div>
        </div>
      ) : (
        <ol className="agenda-list" aria-label="Compromissos">
          {occurrences.map((item) => (
            <li className="agenda-row" key={item.occurrenceId}>
              <div className="agenda-date">
                <strong>{formatWeekdayShort(item.date)}</strong>
                <span>{formatDayMonth(item.date)}</span>
              </div>
              <time dateTime={item.startsAt}>{item.event.time}</time>
              <button type="button" className="agenda-copy" onClick={() => setEditing(item.event)}>
                <h2>{item.event.title}</h2>
                <p>
                  <span>
                    <UsersRound size={14} aria-hidden="true" />
                    {ownerName(item, members)}
                  </span>
                  {item.event.location ? (
                    <span>
                      <MapPin size={14} aria-hidden="true" />
                      {item.event.location}
                    </span>
                  ) : null}
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}

      <button className="add-button" type="button" onClick={() => setEditing("new")} aria-label="Adicionar compromisso">
        <Plus size={20} aria-hidden="true" />
        <span>Adicionar</span>
      </button>
    </section>
  );
}
