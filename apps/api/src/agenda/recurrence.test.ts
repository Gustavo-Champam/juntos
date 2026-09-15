import { describe, expect, it } from "vitest";

import type { AgendaEvent } from "@juntos/contracts";

import { expandAgenda } from "./recurrence.js";

const ids = {
  first: "10000000-0000-4000-8000-000000000401",
  second: "10000000-0000-4000-8000-000000000402",
  third: "10000000-0000-4000-8000-000000000403",
  space: "10000000-0000-4000-8000-000000000404",
  author: "10000000-0000-4000-8000-000000000405",
};

function event(overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id: ids.first,
    spaceId: ids.space,
    title: "Aula",
    date: "2026-09-07",
    time: "19:00",
    durationMinutes: 90,
    location: "Campus",
    notes: "",
    assigneeId: null,
    recurrence: { frequency: "weekly", until: null },
    version: 1,
    createdBy: ids.author,
    updatedBy: ids.author,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("expandAgenda", () => {
  it("expands a weekly series on matching civil weekdays including the anchor", () => {
    expect(expandAgenda([event()], "2026-09-07", "2026-09-21").map((occurrence) => occurrence.date))
      .toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("includes the weekly recurrence until date", () => {
    const occurrences = expandAgenda([
      event({ recurrence: { frequency: "weekly", until: "2026-09-14" } }),
    ], "2026-09-07", "2026-09-21");

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("projects a leap-day single event with Sao Paulo instants", () => {
    const occurrences = expandAgenda([
      event({ date: "2028-02-29", time: "19:00", recurrence: null }),
    ], "2028-02-29", "2028-02-29");

    expect(occurrences).toMatchObject([{
      occurrenceId: `${ids.first}:2028-02-29`,
      eventId: ids.first,
      date: "2028-02-29",
      startsAt: "2028-02-29T22:00:00Z",
      endsAt: "2028-02-29T23:30:00Z",
    }]);
  });

  it("includes a cross-midnight event that starts on the previous civil day", () => {
    const occurrences = expandAgenda([
      event({ date: "2026-09-07", time: "23:30", durationMinutes: 120, recurrence: null }),
    ], "2026-09-08", "2026-09-08");

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ date: "2026-09-07", endsAt: "2026-09-08T04:30:00Z" });
  });

  it("excludes an event whose end is exactly the interval start", () => {
    const occurrences = expandAgenda([
      event({ date: "2026-09-07", time: "23:00", durationMinutes: 60, recurrence: null }),
    ], "2026-09-08", "2026-09-08");

    expect(occurrences).toEqual([]);
  });

  it("uses stable occurrence keys and sorts matching instants by event id", () => {
    const laterIdEvent = event({ id: ids.second, date: "2026-09-08", time: "10:00", recurrence: null });
    const earlierIdEvent = event({ id: ids.first, date: "2026-09-08", time: "10:00", recurrence: null });
    const earliestEvent = event({ id: ids.third, date: "2026-09-08", time: "09:00", recurrence: null });

    expect(expandAgenda([laterIdEvent, earlierIdEvent, earliestEvent], "2026-09-08", "2026-09-08")
      .map((occurrence) => occurrence.occurrenceId))
      .toEqual([
        `${ids.third}:2026-09-08`,
        `${ids.first}:2026-09-08`,
        `${ids.second}:2026-09-08`,
      ]);
  });

  it("does not project a weekly event before its anchor across the maximum query window", () => {
    const occurrences = expandAgenda([
      event({ date: "2026-10-12" }),
    ], "2026-09-01", "2026-10-12");

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(["2026-10-12"]);
  });
});
