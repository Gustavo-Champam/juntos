import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  addCivilDays,
  addMinutes,
  civilInstant,
  isValidTime,
  parseCivilDate,
  weekday,
} from "./civil";
import { requireSpace } from "./space";
import type { AgendaEvent, AgendaFields, AgendaOccurrence } from "./types";

type EventRow = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration_minutes: number;
  location: string;
  notes: string;
  assignee_id: string | null;
  weekly: boolean;
  recurrence_until: string | null;
  version: number;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
};

function asBool(value: boolean | string | number): boolean {
  return value === true || value === "t" || value === 1 || value === "1";
}

function mapEvent(row: EventRow): AgendaEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    durationMinutes: Number(row.duration_minutes),
    location: row.location,
    notes: row.notes,
    assigneeId: row.assignee_id,
    weekly: asBool(row.weekly),
    recurrenceUntil: row.recurrence_until,
    version: Number(row.version),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  };
}

function validateFields(input: AgendaFields): AgendaFields {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new Error("Dê um título de até 120 caracteres.");
  const date = parseCivilDate(input.date);
  if (!isValidTime(input.time)) throw new Error("Informe um horário válido.");
  const duration = Math.round(Number(input.durationMinutes));
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
    throw new Error("A duração precisa ficar entre 1 e 1440 minutos.");
  }
  if (input.location.length > 200) throw new Error("O local é longo demais.");
  if (input.notes.length > 2000) throw new Error("As observações são longas demais.");
  let until: string | null = null;
  if (input.weekly && input.recurrenceUntil) {
    until = parseCivilDate(input.recurrenceUntil);
    if (until < date) throw new Error("A data final precisa ser depois do primeiro dia.");
  }
  return {
    title,
    date,
    time: input.time,
    durationMinutes: duration,
    location: input.location.trim(),
    notes: input.notes.trim(),
    assigneeId: input.assigneeId,
    weekly: Boolean(input.weekly),
    recurrenceUntil: input.weekly ? until : null,
  };
}

export function expandAgenda(
  events: readonly AgendaEvent[],
  from: string,
  to: string,
): AgendaOccurrence[] {
  const occurrences: AgendaOccurrence[] = [];
  for (const event of events) {
    if (event.deletedAt) continue;
    if (!event.weekly) {
      if (event.date >= from && event.date <= to) {
        const startsAt = civilInstant(event.date, event.time);
        occurrences.push({
          occurrenceId: `${event.id}:${event.date}`,
          eventId: event.id,
          date: event.date,
          startsAt,
          endsAt: addMinutes(startsAt, event.durationMinutes),
          event,
        });
      }
      continue;
    }
    const until = event.recurrenceUntil ?? addCivilDays(event.date, 730);
    const eventWeekday = weekday(event.date);
    for (let cursor = from; cursor <= to; cursor = addCivilDays(cursor, 1)) {
      if (cursor < event.date || cursor > until) continue;
      if (weekday(cursor) !== eventWeekday) continue;
      const startsAt = civilInstant(cursor, event.time);
      occurrences.push({
        occurrenceId: `${event.id}:${cursor}`,
        eventId: event.id,
        date: cursor,
        startsAt,
        endsAt: addMinutes(startsAt, event.durationMinutes),
        event,
      });
    }
  }
  return occurrences.sort(
    (left, right) =>
      left.startsAt.localeCompare(right.startsAt) || left.eventId.localeCompare(right.eventId),
  );
}

export const listAgenda = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ context, data }) => {
    const from = parseCivilDate(data.from);
    const to = parseCivilDate(data.to);
    if (to < from) throw new Error("Intervalo inválido.");
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const rows = await sql<EventRow>`
      select id, title, date::text as date, time, duration_minutes, location, notes,
             assignee_id, weekly, recurrence_until::text as recurrence_until, version,
             created_by, updated_by, deleted_at::text as deleted_at
      from agenda_events
      where space_id = ${space.id} and deleted_at is null
    `;
    const events = rows.map(mapEvent);
    return {
      members: space.members,
      occurrences: expandAgenda(events, from, to),
    };
  });

export const createAgendaEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: AgendaFields) => input)
  .handler(async ({ context, data }) => {
    const fields = validateFields(data);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    if (fields.assigneeId && !space.members.some((member) => member.id === fields.assigneeId)) {
      throw new Error("Escolha alguém deste espaço.");
    }
    const id = crypto.randomUUID();
    await sql`
      insert into agenda_events (
        id, space_id, title, date, time, duration_minutes, location, notes,
        assignee_id, weekly, recurrence_until, version, created_by, updated_by
      ) values (
        ${id}, ${space.id}, ${fields.title}, ${fields.date}, ${fields.time},
        ${fields.durationMinutes}, ${fields.location}, ${fields.notes},
        ${fields.assigneeId}, ${fields.weekly}, ${fields.recurrenceUntil},
        1, ${context.userId}, ${context.userId}
      )
    `;
    const saved = await sql<EventRow>`
      select id, title, date::text as date, time, duration_minutes, location, notes,
             assignee_id, weekly, recurrence_until::text as recurrence_until, version,
             created_by, updated_by, deleted_at::text as deleted_at
      from agenda_events where id = ${id}
    `;
    return mapEvent(saved[0]!);
  });

export const updateAgendaEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; expectedVersion: number; event: AgendaFields }) => input)
  .handler(async ({ context, data }) => {
    const fields = validateFields(data.event);
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const updated = await sql<EventRow>`
      update agenda_events set
        title = ${fields.title},
        date = ${fields.date},
        time = ${fields.time},
        duration_minutes = ${fields.durationMinutes},
        location = ${fields.location},
        notes = ${fields.notes},
        assignee_id = ${fields.assigneeId},
        weekly = ${fields.weekly},
        recurrence_until = ${fields.recurrenceUntil},
        version = version + 1,
        updated_by = ${context.userId},
        updated_at = now()
      where space_id = ${space.id}
        and id = ${data.id}
        and version = ${data.expectedVersion}
        and deleted_at is null
      returning id, title, date::text as date, time, duration_minutes, location, notes,
                assignee_id, weekly, recurrence_until::text as recurrence_until, version,
                created_by, updated_by, deleted_at::text as deleted_at
    `;
    if (!updated[0]) {
      throw new Error("Alguém alterou este compromisso agora. Abra de novo para continuar.");
    }
    return mapEvent(updated[0]);
  });

export const deleteAgendaEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; expectedVersion: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    const updated = await sql<{ id: string }>`
      update agenda_events
      set deleted_at = now(), version = version + 1, updated_by = ${context.userId}, updated_at = now()
      where space_id = ${space.id}
        and id = ${data.id}
        and version = ${data.expectedVersion}
        and deleted_at is null
      returning id
    `;
    if (!updated[0]) {
      throw new Error("Alguém alterou este compromisso agora. Abra de novo para continuar.");
    }
    return { ok: true as const };
  });
