import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const REVISION_PATTERN = /^\d+$/;
const MIN_CIVIL_DATE = "2000-01-01";
const MAX_CIVIL_DATE = "2100-12-31";

export function parseCivilDate(value: string): string {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    throw new Error("invalid date");
  }

  try {
    return Temporal.PlainDate.from(value).toString();
  } catch {
    throw new Error("invalid date");
  }
}

export function addCivilDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) {
    throw new Error("invalid day count");
  }

  return Temporal.PlainDate.from(parseCivilDate(date)).add({ days }).toString();
}

export function weekday(date: string): number {
  return Temporal.PlainDate.from(parseCivilDate(date)).dayOfWeek;
}

export function civilInstant(date: string, time: string): string {
  if (!TIME_PATTERN.test(time)) {
    throw new Error("invalid time");
  }

  return Temporal.PlainDateTime.from(`${parseCivilDate(date)}T${time}`)
    .toZonedDateTime("America/Sao_Paulo", { disambiguation: "reject" })
    .toInstant()
    .toString();
}

export function addInstantMinutes(instant: string, minutes: number): string {
  if (!Number.isSafeInteger(minutes)) {
    throw new Error("invalid minute count");
  }

  return Temporal.Instant.from(instant).add({ minutes }).toString();
}

export function civilToday(now?: string): string {
  return (now ? Temporal.Instant.from(now) : Temporal.Now.instant())
    .toZonedDateTimeISO("America/Sao_Paulo")
    .toPlainDate()
    .toString();
}

function isSupportedCivilDate(value: string): boolean {
  try {
    const date = parseCivilDate(value);
    return date >= MIN_CIVIL_DATE && date <= MAX_CIVIL_DATE;
  } catch {
    return false;
  }
}

export const civilDateSchema = z.string().refine(isSupportedCivilDate, "invalid civil date");

const timeSchema = z.string().regex(TIME_PATTERN);
const idSchema = z.uuid();
const versionSchema = z.int().positive();
const revisionSchema = z.string().regex(REVISION_PATTERN);
const utcTimestampSchema = z.iso.datetime();

const recurrenceSchema = z.object({
  frequency: z.literal("weekly"),
  until: civilDateSchema.nullable(),
}).strict();

const agendaFieldsObject = z.object({
  title: z.string().trim().min(1).max(120),
  date: civilDateSchema,
  time: timeSchema,
  durationMinutes: z.int().min(1).max(1440),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  assigneeId: idSchema.nullable(),
  recurrence: recurrenceSchema.nullable(),
}).strict();

function validateRecurrenceRange(
  value: { date: string; recurrence: { frequency: "weekly"; until: string | null } | null },
  context: z.RefinementCtx,
): void {
  const until = value.recurrence?.until;
  if (until === null || until === undefined) {
    return;
  }

  if (!isSupportedCivilDate(value.date)) {
    return;
  }

  const maximumUntil = addCivilDays(value.date, 730);
  if (until < value.date || until > maximumUntil) {
    context.addIssue({
      code: "custom",
      path: ["recurrence", "until"],
      message: "recurrence until must be within two years of the event date",
    });
  }
}

export const agendaFieldsSchema = agendaFieldsObject.superRefine(validateRecurrenceRange);
export type AgendaFields = z.infer<typeof agendaFieldsSchema>;

export const agendaEventSchema = agendaFieldsObject.extend({
  id: idSchema,
  spaceId: idSchema,
  version: versionSchema,
  createdBy: idSchema,
  updatedBy: idSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  deletedAt: utcTimestampSchema.nullable(),
}).strict().superRefine(validateRecurrenceRange);
export type AgendaEvent = z.infer<typeof agendaEventSchema>;

export const agendaOccurrenceSchema = z.object({
  occurrenceId: z.string().min(1),
  eventId: idSchema,
  date: civilDateSchema,
  startsAt: utcTimestampSchema,
  endsAt: utcTimestampSchema,
  event: agendaEventSchema,
}).strict();
export type AgendaOccurrence = z.infer<typeof agendaOccurrenceSchema>;

export const spaceMemberSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  avatarUrl: z.string().nullable(),
}).strict();
export type SpaceMember = z.infer<typeof spaceMemberSchema>;

export const agendaQuerySchema = z.object({
  from: civilDateSchema,
  to: civilDateSchema,
  revision: revisionSchema.optional(),
}).strict().superRefine((value, context) => {
  if (!isSupportedCivilDate(value.from) || !isSupportedCivilDate(value.to)) {
    return;
  }

  if (value.to < value.from || value.to > addCivilDays(value.from, 41)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "query range must be no more than 42 inclusive civil days",
    });
  }
});
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

export const agendaSnapshotSchema = z.object({
  revision: revisionSchema,
  from: civilDateSchema,
  to: civilDateSchema,
  members: z.array(spaceMemberSchema),
  occurrences: z.array(agendaOccurrenceSchema),
}).strict();
export type AgendaSnapshot = z.infer<typeof agendaSnapshotSchema>;

export const agendaReadSchema = z.discriminatedUnion("changed", [
  z.object({ changed: z.literal(false), revision: revisionSchema }).strict(),
  z.object({ changed: z.literal(true), snapshot: agendaSnapshotSchema }).strict(),
]);
export type AgendaRead = z.infer<typeof agendaReadSchema>;

export const createAgendaRequestSchema = z.object({ event: agendaFieldsSchema }).strict();
export type CreateAgendaRequest = z.infer<typeof createAgendaRequestSchema>;

export const updateAgendaRequestSchema = z.object({
  expectedVersion: versionSchema,
  event: agendaFieldsSchema,
}).strict();
export type UpdateAgendaRequest = z.infer<typeof updateAgendaRequestSchema>;

export const deleteAgendaRequestSchema = z.object({
  expectedVersion: versionSchema,
  confirmed: z.literal(true),
}).strict();
export type DeleteAgendaRequest = z.infer<typeof deleteAgendaRequestSchema>;

export const agendaConflictSchema = z.object({
  error: z.literal("version_conflict"),
  current: agendaEventSchema,
}).strict();
export type AgendaConflict = z.infer<typeof agendaConflictSchema>;
