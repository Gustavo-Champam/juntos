import {
  addCivilDays,
  addInstantMinutes,
  civilInstant,
  weekday,
  type AgendaEvent,
  type AgendaOccurrence,
} from "@juntos/contracts";

const MAX_CANDIDATES_PER_SERIES = 43;

function overlaps(start: string, end: string, intervalStart: string, intervalEnd: string): boolean {
  return Date.parse(start) < Date.parse(intervalEnd) && Date.parse(end) > Date.parse(intervalStart);
}

function occursOn(event: AgendaEvent, candidate: string): boolean {
  if (event.recurrence === null) return candidate === event.date;

  return candidate >= event.date
    && weekday(candidate) === weekday(event.date)
    && (event.recurrence.until === null || candidate <= event.recurrence.until);
}

export function expandAgenda(events: readonly AgendaEvent[], from: string, to: string): AgendaOccurrence[] {
  const intervalStart = civilInstant(from, "00:00");
  const intervalEnd = civilInstant(addCivilDays(to, 1), "00:00");
  const occurrences: AgendaOccurrence[] = [];

  for (const event of events) {
    if (event.deletedAt !== null) continue;

    let candidate = addCivilDays(from, -1);
    for (let count = 0; count < MAX_CANDIDATES_PER_SERIES && candidate <= to; count += 1) {
      if (occursOn(event, candidate)) {
        const startsAt = civilInstant(candidate, event.time);
        const endsAt = addInstantMinutes(startsAt, event.durationMinutes);
        if (overlaps(startsAt, endsAt, intervalStart, intervalEnd)) {
          occurrences.push({
            occurrenceId: `${event.id}:${candidate}`,
            eventId: event.id,
            date: candidate,
            startsAt,
            endsAt,
            event,
          });
        }
      }
      candidate = addCivilDays(candidate, 1);
    }
  }

  return occurrences.sort((left, right) => {
    const startsAtDifference = Date.parse(left.startsAt) - Date.parse(right.startsAt);
    if (startsAtDifference !== 0) return startsAtDifference;

    const eventIdDifference = left.eventId.localeCompare(right.eventId);
    if (eventIdDifference !== 0) return eventIdDifference;

    return left.occurrenceId.localeCompare(right.occurrenceId);
  });
}
