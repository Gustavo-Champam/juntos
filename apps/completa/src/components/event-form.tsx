import { useState, type FormEvent } from "react";
import type { AgendaEvent, AgendaFields, SpaceMember } from "@/lib/types";

type EventFormProps = {
  event: AgendaEvent | null;
  defaultDate: string;
  members: SpaceMember[];
  onSave: (fields: AgendaFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
};

export function EventForm({ event, defaultDate, members, onSave, onDelete, onCancel }: EventFormProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [time, setTime] = useState(event?.time ?? "19:00");
  const [durationMinutes, setDurationMinutes] = useState(event?.durationMinutes ?? 60);
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [assigneeId, setAssigneeId] = useState<string | null>(event?.assigneeId ?? null);
  const [weekly, setWeekly] = useState(event?.weekly ?? false);
  const [recurrenceUntil, setRecurrenceUntil] = useState(event?.recurrenceUntil ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onSave({
        title,
        date,
        time,
        durationMinutes: Number(durationMinutes),
        location,
        notes,
        assigneeId,
        weekly,
        recurrenceUntil: weekly && recurrenceUntil ? recurrenceUntil : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setPending(true);
    setError("");
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
      setPending(false);
    }
  }

  return (
    <section className="editor-sheet" aria-labelledby="event-form-title">
      <p className="eyebrow">{event ? "Editar" : "Novo compromisso"}</p>
      <h2 id="event-form-title">{event ? "Ajustar compromisso" : "Adicionar compromisso"}</h2>
      <form className="identity-form" onSubmit={submit} noValidate>
        <label htmlFor="event-title">Título</label>
        <input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} required />

        <div className="form-grid">
          <div>
            <label htmlFor="event-date">Data</label>
            <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="event-time">Horário</label>
            <input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>

        <label htmlFor="event-duration">Duração em minutos</label>
        <input
          id="event-duration"
          type="number"
          min={1}
          max={1440}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
        />

        <label htmlFor="event-location">Local</label>
        <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} />

        <label htmlFor="event-notes">Observações</label>
        <textarea id="event-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <fieldset className="choice-set">
          <legend>Responsável</legend>
          <label>
            <input type="radio" name="assignee" checked={assigneeId === null} onChange={() => setAssigneeId(null)} />
            Nós dois
          </label>
          {members.map((member) => (
            <label key={member.id}>
              <input
                type="radio"
                name="assignee"
                checked={assigneeId === member.id}
                onChange={() => setAssigneeId(member.id)}
              />
              {member.name}
            </label>
          ))}
        </fieldset>

        <label className="check-row">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          Repetir toda semana
        </label>
        {weekly ? (
          <>
            <label htmlFor="event-until">Até</label>
            <input id="event-until" type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} />
          </>
        ) : null}

        {error ? (
          <p role="alert" className="form-alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button className="identity-action" type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar compromisso"}
          </button>
          <button className="quiet-button" type="button" onClick={onCancel} disabled={pending}>
            Cancelar
          </button>
        </div>
      </form>

      {event && onDelete ? (
        <div className="leave-section">
          {confirmDelete ? (
            <>
              <p>Excluir toda a série deste compromisso?</p>
              <div className="form-actions">
                <button className="danger-button" type="button" onClick={() => void remove()} disabled={pending}>
                  Excluir
                </button>
                <button className="quiet-button" type="button" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button className="danger-button" type="button" onClick={() => setConfirmDelete(true)}>
              Excluir compromisso
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
