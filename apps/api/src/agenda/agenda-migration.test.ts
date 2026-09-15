import { describe, expect, it } from "vitest";

import { createAgendaTestDatabase } from "./test-database.js";

describe("agenda migration", () => {
  it("creates per-space records with foreign keys and positive versions", async () => {
    const { pool, anaId, identity } = await createAgendaTestDatabase();
    try {
      const spaceId = (await identity.getBootstrap(anaId)).space?.id;
      expect(spaceId).toBeDefined();
      const createdAt = new Date("2026-09-06T12:00:00.000Z");
      const eventId = "00000000-0000-0000-0000-000000000101";

      await pool.query(
        `INSERT INTO agenda_events (
          id, space_id, title, date, time, duration_minutes, location, notes,
          assignee_id, weekly, recurrence_until, created_by, updated_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $13)`,
        [eventId, spaceId, "Aula", "2026-09-07", "19:00", 90, "Campus", "", null, false, null, anaId, createdAt],
      );
      expect((await pool.query("SELECT version FROM agenda_events WHERE id = $1", [eventId])).rows).toEqual([{ version: 1 }]);

      await expect(
        pool.query(
          `INSERT INTO agenda_events (
            id, space_id, title, date, time, duration_minutes, location, notes,
            assignee_id, weekly, recurrence_until, version, created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, $14)`,
          ["00000000-0000-0000-0000-000000000102", spaceId, "Aula", "2026-09-07", "19:00", 90, "Campus", "", null, false, null, 0, anaId, createdAt],
        ),
      ).rejects.toThrow();
      await expect(
        pool.query(
          "INSERT INTO agenda_state (space_id) VALUES ($1)",
          ["00000000-0000-0000-0000-000000000999"],
        ),
      ).rejects.toThrow();
      await expect(
        pool.query(
          "INSERT INTO agenda_activity (id, space_id, event_id, actor_id, action, version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          ["00000000-0000-0000-0000-000000000103", spaceId, "00000000-0000-0000-0000-000000000999", anaId, "created", 1, createdAt],
        ),
      ).rejects.toThrow();
    } finally {
      await pool.end();
    }
  });
});
