import type { Database } from "../db/pool.js";
import { describe, expect, it } from "vitest";

import { createAgendaTestDatabase } from "../agenda/test-database.js";
import { withMemberTransaction } from "./member-transaction.js";

class SpaceFirstLockDatabase {
  readonly statements: string[] = [];
  released = false;
  rolledBack = false;
  callbackWorkVisible = false;
  private stage = 0;

  async connect() {
    return {
      query: async <T>(statement: string) => {
        const sql = statement.replace(/\s+/g, " ").trim().toLowerCase();
        this.statements.push(sql);
        if (sql === "begin") return { rows: [] } as { rows: T[] };
        if (sql === "commit") {
          if (this.stage !== 5) throw new Error("commit before trusted state lock");
          return { rows: [] } as { rows: T[] };
        }
        if (sql === "rollback") {
          this.rolledBack = true;
          this.callbackWorkVisible = false;
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && !sql.includes("for update")) {
          if (this.stage !== 0) throw new Error("membership lookup must happen first");
          this.stage = 1;
          return { rows: [{ space_id: "space" }] } as { rows: T[] };
        }
        if (sql.includes("from couple_spaces") && sql.includes("for update")) {
          if (this.stage !== 1) throw new Error("space must lock before membership recheck");
          this.stage = 2;
          return { rows: [{ id: "space" }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && sql.includes("for update")) {
          if (this.stage !== 2) throw new Error("membership must recheck after space lock");
          this.stage = 3;
          return { rows: [{ space_id: "space" }] } as { rows: T[] };
        }
        if (sql.startsWith("insert into agenda_state")) {
          if (this.stage !== 3) throw new Error("state must follow authorization");
          this.stage = 4;
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from agenda_state") && sql.includes("for update")) {
          if (this.stage !== 4) throw new Error("state must lock after creation");
          this.stage = 5;
          return { rows: [{ revision: 0 }] } as { rows: T[] };
        }
        if (sql === "insert into callback_work") {
          if (this.stage !== 5) throw new Error("callback must run after trusted state lock");
          this.callbackWorkVisible = true;
          return { rows: [] } as { rows: T[] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
      release: () => { this.released = true; },
    };
  }

  async query(): Promise<never> {
    throw new Error("root queries are not used in member transactions");
  }
}

class AuthorizationDatabase {
  rolledBack = false;
  released = false;
  spaceQuery = "";

  constructor(
    private readonly membership: string | null,
    private readonly spaceState: "present" | "absent" | "archived",
  ) {}

  async connect() {
    return {
      query: async <T>(statement: string) => {
        const sql = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql === "begin" || sql === "commit") return { rows: [] } as { rows: T[] };
        if (sql === "rollback") {
          this.rolledBack = true;
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && !sql.includes("for update")) {
          return { rows: this.membership ? [{ space_id: this.membership }] : [] } as { rows: T[] };
        }
        if (sql.includes("from couple_spaces") && sql.includes("for update")) {
          this.spaceQuery = sql;
          if (this.spaceState === "present") return { rows: [{ id: this.membership, archived_at: null }] } as { rows: T[] };
          if (this.spaceState === "archived" && !sql.includes("archived_at is null")) {
            return { rows: [{ id: this.membership, archived_at: new Date("2026-09-06T12:00:00.000Z") }] } as { rows: T[] };
          }
          return { rows: [] } as { rows: T[] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
      release: () => { this.released = true; },
    };
  }

  async query(): Promise<never> {
    throw new Error("root queries are not used in member transactions");
  }
}

describe("withMemberTransaction", () => {
  it("locks the space before rechecking membership and exposes only its trusted id", async () => {
    const database = new SpaceFirstLockDatabase();

    await expect(
      withMemberTransaction(database as unknown as Database, "member", async (_client, spaceId) => spaceId),
    ).resolves.toBe("space");
    expect(database.released).toBe(true);
  });

  it("authorizes an active member and initializes the locked state", async () => {
    const { pool, identity, anaId } = await createAgendaTestDatabase();
    try {
      const expectedSpaceId = (await identity.getBootstrap(anaId)).space?.id;
      await expect(
        withMemberTransaction(pool, anaId, async (client, spaceId) => {
          expect(spaceId).toBe(expectedSpaceId);
          expect((await client.query("SELECT revision FROM agenda_state WHERE space_id = $1", [spaceId])).rows).toEqual([{ revision: 0 }]);
          return "private";
        }),
      ).resolves.toBe("private");
    } finally {
      await pool.end();
    }
  });

  it("does not authorize a departed member", async () => {
    const { pool, identity, biaId } = await createAgendaTestDatabase();
    try {
      await identity.leaveSpace(biaId, new Date("2026-09-06T12:00:00.000Z"));
      await expect(withMemberTransaction(pool, biaId, async () => "private"))
        .rejects.toMatchObject({ status: 403 });
    } finally {
      await pool.end();
    }
  });

  it("rejects a user with no membership with 403", async () => {
    const database = new AuthorizationDatabase(null, "absent");

    await expect(withMemberTransaction(database as unknown as Database, "member", async () => "private"))
      .rejects.toMatchObject({ status: 403 });
    expect(database.rolledBack).toBe(true);
    expect(database.released).toBe(true);
  });

  it("rejects an absent space with 403", async () => {
    const database = new AuthorizationDatabase("space", "absent");

    await expect(withMemberTransaction(database as unknown as Database, "member", async () => "private"))
      .rejects.toMatchObject({ status: 403 });
    expect(database.rolledBack).toBe(true);
    expect(database.released).toBe(true);
  });

  it("filters an archived space before it can authorize a member", async () => {
    const database = new AuthorizationDatabase("space", "archived");

    await expect(withMemberTransaction(database as unknown as Database, "member", async () => "private"))
      .rejects.toMatchObject({ status: 403 });
    expect(database.spaceQuery).toContain("archived_at is null");
    expect(database.rolledBack).toBe(true);
    expect(database.released).toBe(true);
  });

  it("rolls back callback work and releases the client when the callback fails", async () => {
    const database = new SpaceFirstLockDatabase();

    await expect(
      withMemberTransaction(database as unknown as Database, "member", async (client) => {
        await client.query("INSERT INTO callback_work");
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");
    expect(database.rolledBack).toBe(true);
    expect(database.callbackWorkVisible).toBe(false);
    expect(database.released).toBe(true);
  });
});
