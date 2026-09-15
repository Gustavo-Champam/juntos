import { describe, expect, it } from "vitest";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import type { Database } from "../db/pool.js";
import { createAgendaTestDatabase } from "./test-database.js";
import { PostgresAgendaStore } from "./postgres-agenda-store.js";

const event = {
  title: "Aula",
  date: "2026-09-07",
  time: "19:00",
  durationMinutes: 90,
  location: "Campus",
  notes: "",
  assigneeId: null,
  recurrence: null,
} as const;

const fixedNow = new Date("2026-09-06T12:00:00.000Z");
const ids = [
  "00000000-0000-0000-0000-000000000101",
  "00000000-0000-0000-0000-000000000102",
  "00000000-0000-0000-0000-000000000103",
  "00000000-0000-0000-0000-000000000104",
];

function createStore(pool: Awaited<ReturnType<typeof createAgendaTestDatabase>>["pool"]): PostgresAgendaStore {
  let next = 0;
  return new PostgresAgendaStore(pool, {
    now: () => fixedNow,
    id: () => ids[next++] ?? crypto.randomUUID(),
  });
}

function databaseReturningDateObjectsForUntypedDates(pool: Pool, date: Date, recurrenceUntil: Date): Database {
  return {
    query: pool.query.bind(pool),
    async connect() {
      const client = await pool.connect();
      return {
        release: () => client.release(),
        query: async <T extends QueryResultRow>(statement: string, values?: unknown[]): Promise<QueryResult<T>> => {
          const result = await client.query<T>(statement, values);
          const sql = statement.toLowerCase();
          if (sql.includes("from agenda_events")) {
            for (const row of result.rows as Array<Record<string, unknown>>) {
              row.date = date;
              row.recurrence_until = recurrenceUntil;
            }
          }
          return result;
        },
      } as PoolClient;
    },
  };
}

describe("PostgresAgendaStore", () => {
  it("preserves date and recurrence-until when a PostgreSQL date would cross the UTC day", async () => {
    const f = await createAgendaTestDatabase();
    const originalTimezone = process.env.TZ;
    try {
      const created = await createStore(f.pool).create(f.anaId, {
        event: { ...event, date: "2026-09-07", recurrence: { frequency: "weekly", until: "2026-09-14" } },
      });
      process.env.TZ = "Etc/GMT-3";
      const pgDate = new Date(2026, 8, 7);
      const pgRecurrenceUntil = new Date(2026, 8, 14);
      expect(pgDate.toISOString().slice(0, 10)).toBe("2026-09-06");
      expect(pgRecurrenceUntil.toISOString().slice(0, 10)).toBe("2026-09-13");
      const store = new PostgresAgendaStore(
        databaseReturningDateObjectsForUntypedDates(f.pool, pgDate, pgRecurrenceUntil),
      );

      const saved = (await store.read(f.anaId)).events[0];
      expect(saved).toMatchObject({
        id: created.id,
        date: "2026-09-07",
        recurrence: { frequency: "weekly", until: "2026-09-14" },
      });
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
      await f.pool.end();
    }
  });

  it("creates a server-authored event and exposes only current public members", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      const created = await store.create(f.anaId, { event: { ...event, assigneeId: f.biaId } });

      expect(created).toMatchObject({
        id: ids[0],
        version: 1,
        spaceId: (await f.identity.getBootstrap(f.anaId)).space?.id,
        createdBy: f.anaId,
        updatedBy: f.anaId,
        createdAt: "2026-09-06T12:00:00.000Z",
        updatedAt: "2026-09-06T12:00:00.000Z",
        deletedAt: null,
      });

      const rows = await store.read(f.biaId);
      expect(rows.revision).toBe("1");
      expect(rows.events).toEqual([created]);
      expect(rows.members).toEqual([
        { id: f.anaId, name: "Ana", avatarUrl: null },
        { id: f.biaId, name: "Bia", avatarUrl: null },
      ]);
      expect(JSON.stringify(rows)).not.toContain("@example.com");
    } finally {
      await f.pool.end();
    }
  });

  it("returns the current version and preserves the first writer", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      const first = await store.create(f.anaId, { event });
      const saved = await store.update(f.biaId, first.id, { expectedVersion: 1, event: { ...event, title: "Prova" } });

      expect(saved).toMatchObject({ title: "Prova", version: 2, createdBy: f.anaId, updatedBy: f.biaId });
      await expect(store.update(f.anaId, first.id, { expectedVersion: 1, event }))
        .rejects.toMatchObject({ current: { title: "Prova", version: 2 } });
      expect((await store.read(f.anaId)).events[0]?.title).toBe("Prova");
    } finally {
      await f.pool.end();
    }
  });

  it("makes foreign-space reads empty and foreign mutations indistinguishable from missing events", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      const created = await store.create(f.anaId, { event });

      await expect(store.read(f.claraId)).resolves.toMatchObject({ revision: "0", events: [], members: [{ id: f.claraId, name: "Clara", avatarUrl: null }] });
      await expect(store.update(f.claraId, created.id, { expectedVersion: 1, event }))
        .rejects.toMatchObject({ status: 404 });
      await expect(store.delete(f.claraId, created.id, { expectedVersion: 1, confirmed: true }))
        .rejects.toMatchObject({ status: 404 });
    } finally {
      await f.pool.end();
    }
  });

  it("rejects a non-member assignee without advancing the revision", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      await expect(store.create(f.anaId, { event: { ...event, assigneeId: f.claraId } }))
        .rejects.toMatchObject({ status: 400 });
      expect((await store.read(f.anaId)).revision).toBe("0");
      expect((await f.pool.query("SELECT count(*)::int AS count FROM agenda_activity")).rows).toEqual([{ count: 0 }]);
    } finally {
      await f.pool.end();
    }
  });

  it("keeps a tombstone conflicted, never resurrects it, and preserves its departed assignee id", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      const created = await store.create(f.anaId, { event: { ...event, assigneeId: f.biaId } });
      const deleted = await store.delete(f.anaId, created.id, { expectedVersion: 1, confirmed: true });
      const stillAssigned = await store.create(f.anaId, { event: { ...event, title: "Ainda visível", assigneeId: f.biaId } });

      expect(deleted).toMatchObject({ version: 2, assigneeId: f.biaId, deletedAt: "2026-09-06T12:00:00.000Z" });
      await expect(store.update(f.biaId, created.id, { expectedVersion: 2, event: { ...event, title: "Nao volta" } }))
        .rejects.toMatchObject({ current: { id: created.id, version: 2, deletedAt: "2026-09-06T12:00:00.000Z" } });
      expect((await store.read(f.anaId)).events.map((saved) => saved.id)).toEqual([stillAssigned.id]);

      await f.identity.leaveSpace(f.biaId, fixedNow);
      const ownerRows = await store.read(f.anaId);
      expect(ownerRows.members).toEqual([{ id: f.anaId, name: "Ana", avatarUrl: null }]);
      expect(ownerRows.events).toEqual([stillAssigned]);
      expect(ownerRows.events[0]?.assigneeId).toBe(f.biaId);
      expect(JSON.stringify(ownerRows)).not.toContain("bia@example.com");
    } finally {
      await f.pool.end();
    }
  });

  it("records one redacted activity and revision increment for each successful write only", async () => {
    const f = await createAgendaTestDatabase();
    try {
      const store = createStore(f.pool);
      const created = await store.create(f.anaId, { event: { ...event, notes: "segredo" } });
      await store.update(f.biaId, created.id, { expectedVersion: 1, event: { ...event, title: "Prova", notes: "segredo" } });
      await expect(store.update(f.anaId, created.id, { expectedVersion: 1, event })).rejects.toMatchObject({ current: { version: 2 } });
      await store.delete(f.biaId, created.id, { expectedVersion: 2, confirmed: true });

      expect((await store.read(f.anaId)).revision).toBe("3");
      expect((await f.pool.query("SELECT action, version, actor_id FROM agenda_activity ORDER BY created_at, version")).rows)
        .toEqual([
          { action: "created", version: 1, actor_id: f.anaId },
          { action: "updated", version: 2, actor_id: f.biaId },
          { action: "deleted", version: 3, actor_id: f.biaId },
        ]);
      expect(JSON.stringify((await f.pool.query("SELECT * FROM agenda_activity")).rows)).not.toContain("segredo");
    } finally {
      await f.pool.end();
    }
  });
});
