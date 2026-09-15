export const TIMEZONE = "America/Sao_Paulo";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseCivilDate(value: string): string {
  if (!DATE_RE.test(value)) throw new Error("invalid date");
  const [year, month, day] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const next = new Date(utc);
  if (
    next.getUTCFullYear() !== year ||
    next.getUTCMonth() + 1 !== month ||
    next.getUTCDate() !== day
  ) {
    throw new Error("invalid date");
  }
  return value;
}

export function addCivilDays(date: string, days: number): string {
  const [year, month, day] = parseCivilDate(date).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function weekday(date: string): number {
  const [year, month, day] = parseCivilDate(date).split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function startOfWeek(date: string): string {
  return addCivilDays(date, 1 - weekday(date));
}

export function civilToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function civilInstant(date: string, time: string): string {
  return `${parseCivilDate(date)}T${time}:00-03:00`;
}

export function addMinutes(instant: string, minutes: number): string {
  const date = new Date(instant);
  date.setTime(date.getTime() + minutes * 60_000);
  return date.toISOString();
}

export function formatDayTitle(date: string): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIMEZONE,
  }).format(new Date(`${date}T12:00:00-03:00`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatWeekdayShort(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: TIMEZONE,
  })
    .format(new Date(`${date}T12:00:00-03:00`))
    .replace(".", "");
}

export function formatDayMonth(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: TIMEZONE,
  }).format(new Date(`${date}T12:00:00-03:00`));
}

export function formatMonthYear(date: string): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE,
  }).format(new Date(`${date}T12:00:00-03:00`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
