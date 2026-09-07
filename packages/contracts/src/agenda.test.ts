import { describe, expect, it } from "vitest";

import {
  addCivilDays,
  addInstantMinutes,
  agendaConflictSchema,
  agendaEventSchema,
  agendaFieldsSchema,
  agendaOccurrenceSchema,
  agendaQuerySchema,
  agendaReadSchema,
  agendaSnapshotSchema,
  civilInstant,
  civilToday,
  createAgendaRequestSchema,
  deleteAgendaRequestSchema,
  parseCivilDate,
  updateAgendaRequestSchema,
  weekday,
} from "./agenda.js";

const ids = {
  event: "30183762-a420-4e2a-b4f4-d9b9ce5fc1bf",
  space: "5b919e2c-13db-4af8-bf12-4275ec6948fe",
  ana: "af705c05-7e5c-45cd-8251-49a4b7c53599",
  bia: "b6576481-6dfd-4374-a368-480371325cf6",
};

const fields = {
  title: " Aula ",
  date: "2028-02-29",
  time: "19:00",
  durationMinutes: 90,
  location: " Campus ",
  notes: " Revisar material ",
  assigneeId: null,
  recurrence: { frequency: "weekly" as const, until: "2028-03-14" },
};

const event = {
  ...fields,
  id: ids.event,
  spaceId: ids.space,
  version: 1,
  createdBy: ids.ana,
  updatedBy: ids.bia,
  createdAt: "2028-02-29T22:00:00Z",
  updatedAt: "2028-02-29T22:05:00Z",
  deletedAt: null,
};

describe("agenda civil date helpers", () => {
  it("accepts real leap days and rejects impossible or non-civil dates", () => {
    expect(parseCivilDate("2028-02-29")).toBe("2028-02-29");
    expect(() => parseCivilDate("2027-02-29")).toThrow("invalid date");
    expect(() => parseCivilDate("2028-2-29")).toThrow("invalid date");
  });

  it("does civil calendar arithmetic without the server timezone", () => {
    expect(addCivilDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(weekday("2028-02-29")).toBe(2);
    expect(civilToday("2028-03-01T01:30:00Z")).toBe("2028-02-29");
  });

  it("converts São Paulo civil values to instants and adds durations", () => {
    expect(civilInstant("2028-02-29", "19:00")).toBe("2028-02-29T22:00:00Z");
    expect(addInstantMinutes("2028-02-29T22:00:00Z", 90)).toBe("2028-02-29T23:30:00Z");
  });
});

describe("agenda fields", () => {
  it("normalizes permitted editable fields", () => {
    expect(agendaFieldsSchema.parse(fields)).toEqual({
      ...fields,
      title: "Aula",
      location: "Campus",
      notes: "Revisar material",
    });
  });

  it("rejects impossible dates, invalid time and duration", () => {
    expect(agendaFieldsSchema.safeParse({ ...fields, date: "2028-02-30" }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, date: "1999-12-31" }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, time: "24:00" }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, durationMinutes: 0 }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, durationMinutes: 90.5 }).success).toBe(false);
  });

  it("rejects invalid recurrence ranges and injected identity fields", () => {
    expect(agendaFieldsSchema.safeParse({
      ...fields,
      recurrence: { frequency: "weekly", until: "2028-02-28" },
    }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({
      ...fields,
      recurrence: { frequency: "weekly", until: "2030-03-01" },
    }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, spaceId: ids.space }).success).toBe(false);
    expect(agendaFieldsSchema.safeParse({ ...fields, createdBy: ids.ana }).success).toBe(false);
  });
});

describe("agenda query and request contracts", () => {
  it("allows at most 42 inclusive civil days and a decimal revision", () => {
    expect(agendaQuerySchema.parse({ from: "2028-02-01", to: "2028-03-13", revision: "42" })).toEqual({
      from: "2028-02-01",
      to: "2028-03-13",
      revision: "42",
    });
    expect(agendaQuerySchema.safeParse({ from: "2028-02-01", to: "2028-03-14" }).success).toBe(false);
    expect(agendaQuerySchema.safeParse({ from: "2028-03-01", to: "2028-02-29" }).success).toBe(false);
    expect(agendaQuerySchema.safeParse({ from: "2028-02-01", to: "2028-02-02", revision: "4.2" }).success).toBe(false);
  });

  it("rejects impossible query dates without throwing during range validation", () => {
    const query = { from: "2028-02-30", to: "2028-03-01" };

    expect(() => agendaQuerySchema.safeParse(query)).not.toThrow();
    expect(agendaQuerySchema.safeParse(query)).toMatchObject({ success: false });
  });

  it("accepts only strict client mutation envelopes", () => {
    expect(createAgendaRequestSchema.parse({ event: fields }).event.title).toBe("Aula");
    expect(updateAgendaRequestSchema.parse({ expectedVersion: 1, event: fields }).expectedVersion).toBe(1);
    expect(deleteAgendaRequestSchema.parse({ expectedVersion: 1, confirmed: true }).confirmed).toBe(true);
    expect(createAgendaRequestSchema.safeParse({ event: fields, userId: ids.ana }).success).toBe(false);
    expect(updateAgendaRequestSchema.safeParse({ expectedVersion: 0, event: fields }).success).toBe(false);
    expect(deleteAgendaRequestSchema.safeParse({ expectedVersion: 1, confirmed: false }).success).toBe(false);
  });
});

describe("agenda response contracts", () => {
  it("accepts complete strict events and occurrences with UTC timestamps", () => {
    const parsedEvent = agendaEventSchema.parse(event);
    expect(parsedEvent.title).toBe("Aula");
    expect(agendaOccurrenceSchema.parse({
      occurrenceId: `${ids.event}:2028-02-29`,
      eventId: ids.event,
      date: "2028-02-29",
      startsAt: "2028-02-29T22:00:00Z",
      endsAt: "2028-02-29T23:30:00Z",
      event,
    }).event.id).toBe(ids.event);
    expect(agendaEventSchema.safeParse({ ...event, updatedAt: "2028-02-29T19:05:00-03:00" }).success).toBe(false);
    expect(agendaEventSchema.safeParse({ ...event, internalNote: "never expose" }).success).toBe(false);
  });

  it("represents changed and unchanged reads without accepting mixed states", () => {
    const snapshot = {
      revision: "9",
      from: "2028-02-29",
      to: "2028-03-13",
      members: [{ id: ids.ana, name: "Ana", avatarUrl: null }],
      occurrences: [{
        occurrenceId: `${ids.event}:2028-02-29`,
        eventId: ids.event,
        date: "2028-02-29",
        startsAt: "2028-02-29T22:00:00Z",
        endsAt: "2028-02-29T23:30:00Z",
        event,
      }],
    };
    expect(agendaSnapshotSchema.parse(snapshot).revision).toBe("9");
    expect(agendaReadSchema.parse({ changed: false, revision: "9" })).toEqual({ changed: false, revision: "9" });
    expect(agendaReadSchema.parse({ changed: true, snapshot }).snapshot.members[0]?.name).toBe("Ana");
    expect(agendaReadSchema.safeParse({ changed: false, revision: "9", snapshot }).success).toBe(false);
  });

  it("carries a strict current event for optimistic version conflicts", () => {
    expect(agendaConflictSchema.parse({ error: "version_conflict", current: event }).current.version).toBe(1);
    expect(agendaConflictSchema.safeParse({ error: "version_conflict", current: { ...event, actorId: ids.ana } }).success).toBe(false);
  });
});
