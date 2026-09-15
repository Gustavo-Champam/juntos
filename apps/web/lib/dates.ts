import { addCivilDays, civilToday, parseCivilDate, weekday } from "@juntos/contracts";

export { addCivilDays, civilToday, parseCivilDate };

export function startOfWeek(date: string): string {
  return addCivilDays(parseCivilDate(date), 1 - weekday(date));
}

export function formatDayMonth(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(
    new Date(`${parseCivilDate(date)}T12:00:00`),
  );
}

export function formatWeekdayShort(date: string): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(
    new Date(`${parseCivilDate(date)}T12:00:00`),
  );
  return formatted.replace(".", "").replace(/^./, (letter) => letter.toUpperCase());
}
