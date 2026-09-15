import { describe, expect, it } from "vitest";

import type {
  AgendaEvent,
  CreateAgendaRequest,
  DeleteAgendaRequest,
  SpaceMember,
  UpdateAgendaRequest,
} from "@juntos/contracts";

import type { AgendaRows, AgendaStore } from "./agenda-store.js";
import { AgendaService } from "./agenda-service.js";

const ids = {
  user: "10000000-0000-4000-8000-000000000501",
  event: "10000000-0000-4000-8000-000000000502",
  space: "10000000-0000-4000-8000-000000000503",
};

const fields = {
  title: "Aula",
  date: "2026-09-07",
  time: "19:00",
  durationMinutes: 90,
  location: "Campus",
  notes: "",
  assigneeId: null,
  recurrence: null,
} as const;

function savedEvent(overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    ...fields,
    id: ids.event,
    spaceId: ids.space,
    version: 1,
    createdBy: ids.user,
    updatedBy: ids.user,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

class MemoryAgendaStore implements AgendaStore {
  readonly calls = { read: 0, create: 0, update: 0, delete: 0 };

  constructor(private readonly rows: AgendaRows) {}

  async read(_userId: string): Promise<AgendaRows> {
    this.calls.read += 1;
    return this.rows;
  }

  async create(_userId: string, input: CreateAgendaRequest): Promise<AgendaEvent> {
    this.calls.create += 1;
    return savedEvent(input.event);
  }

  async update(_userId: string, id: string, input: UpdateAgendaRequest): Promise<AgendaEvent> {
    this.calls.update += 1;
    return savedEvent({ id, ...input.event, version: input.expectedVersion + 1 });
  }

  async delete(_userId: string, id: string, _input: DeleteAgendaRequest): Promise<AgendaEvent> {
    this.calls.delete += 1;
    return savedEvent({ id, version: 2, deletedAt: "2026-09-02T00:00:00Z" });
  }
}

function store(rows: Partial<AgendaRows> = {}): MemoryAgendaStore {
  return new MemoryAgendaStore({
    revision: "7",
    events: [savedEvent()],
    members: [{ id: ids.user, name: "Ana", avatarUrl: null }] satisfies SpaceMember[],
    ...rows,
  });
}

describe("AgendaService", () => {
  it("returns the requested interval snapshot with expanded occurrences", async () => {
    const memory = store({ events: [savedEvent({ recurrence: { frequency: "weekly", until: "2026-09-14" } })] });
    const result = await new AgendaService(memory).list(ids.user, { from: "2026-09-07", to: "2026-09-21" });

    expect(result).toMatchObject({
      changed: true,
      snapshot: {
        revision: "7",
        from: "2026-09-07",
        to: "2026-09-21",
        members: [{ id: ids.user, name: "Ana", avatarUrl: null }],
      },
    });
    expect(result.changed && result.snapshot.occurrences.map((occurrence) => occurrence.date))
      .toEqual(["2026-09-07", "2026-09-14"]);
    expect(memory.calls).toEqual({ read: 1, create: 0, update: 0, delete: 0 });
  });

  it("returns an unchanged response for the caller's unchanged interval revision", async () => {
    const memory = store();
    const result = await new AgendaService(memory).list(ids.user, {
      from: "2026-09-07",
      to: "2026-09-13",
      revision: "7",
    });

    expect(result).toEqual({ changed: false, revision: "7" });
    expect(memory.calls).toEqual({ read: 1, create: 0, update: 0, delete: 0 });
  });

  it("rejects an invalid or injected list query before reading", async () => {
    const memory = store();
    const service = new AgendaService(memory);

    await expect(service.list(ids.user, { from: "2026-09-01", to: "2026-10-13" })).rejects.toThrow();
    await expect(service.list(ids.user, { from: "2026-09-01", to: "2026-09-01", userId: ids.user } as never)).rejects.toThrow();

    expect(memory.calls).toEqual({ read: 0, create: 0, update: 0, delete: 0 });
  });

  it("rejects a malformed caller id before accessing the store", async () => {
    const memory = store();

    await expect(new AgendaService(memory).list("not-a-uuid", { from: "2026-09-01", to: "2026-09-01" })).rejects.toThrow();

    expect(memory.calls).toEqual({ read: 0, create: 0, update: 0, delete: 0 });
  });

  it("validates strict create, update, delete requests and event ids before writes", async () => {
    const memory = store();
    const service = new AgendaService(memory);

    await expect(service.create(ids.user, { event: { ...fields, title: "" } })).rejects.toThrow();
    await expect(service.create(ids.user, { event: fields, userId: ids.user } as never)).rejects.toThrow();
    await expect(service.update(ids.user, "not-a-uuid", { expectedVersion: 1, event: fields })).rejects.toThrow();
    await expect(service.update(ids.user, ids.event, { expectedVersion: 0, event: fields })).rejects.toThrow();
    await expect(service.delete(ids.user, ids.event, { expectedVersion: 1, confirmed: false } as never)).rejects.toThrow();

    expect(memory.calls).toEqual({ read: 0, create: 0, update: 0, delete: 0 });
  });

  it("passes validated write requests through to the store", async () => {
    const memory = store();
    const service = new AgendaService(memory);

    await expect(service.create(ids.user, { event: { ...fields, title: "  Aula  " } })).resolves.toMatchObject({ title: "Aula" });
    await expect(service.update(ids.user, ids.event, { expectedVersion: 1, event: fields })).resolves.toMatchObject({ version: 2 });
    await expect(service.delete(ids.user, ids.event, { expectedVersion: 1, confirmed: true })).resolves.toMatchObject({ version: 2 });

    expect(memory.calls).toEqual({ read: 0, create: 1, update: 1, delete: 1 });
  });
});
