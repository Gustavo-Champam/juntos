import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../db/migration-runner.js";
import type { Database } from "../db/pool.js";
import { hashOpaqueToken } from "../security/tokens.js";
import { PostgresIdentityStore } from "./postgres-identity-store.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
const anaId = "00000000-0000-0000-0000-000000000001";
const biaId = "00000000-0000-0000-0000-000000000002";
const claraId = "00000000-0000-0000-0000-000000000003";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve: () => resolve?.() };
}

class InvitationLockDatabase {
  readonly invitationLocked = deferred();
  readonly creationBlocked = deferred();
  readonly allowAcceptance = deferred();
  private readonly invitationReleased = deferred();
  private readonly spaceReleased = deferred();
  private invitationOwner: "accept" | "create" | null = null;
  private spaceOwner: "accept" | "create" | null = null;

  async connect() {
    let role: "accept" | "create" | null = null;
    return {
      query: async <T>(statement: string) => {
        const sql = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql === "begin" || sql === "rollback") return { rows: [] } as { rows: T[] };
        if (sql === "commit") {
          if (this.invitationOwner === role) {
            this.invitationOwner = null;
            this.invitationReleased.resolve();
          }
          if (this.spaceOwner === role) {
            this.spaceOwner = null;
            this.spaceReleased.resolve();
          }
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from invitations") && sql.includes("for update")) {
          role = "accept";
          this.invitationOwner = role;
          this.invitationLocked.resolve();
          await this.allowAcceptance.promise;
          return { rows: [{ id: "invite", space_id: "space", invited_email: null, expires_at: new Date("2026-10-01T00:00:00.000Z"), accepted_at: null, revoked_at: null }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && sql.includes("user_id = $1 for update")) {
          role = "create";
          return { rows: [{ space_id: "space" }] } as { rows: T[] };
        }
        if (sql.startsWith("update invitations set revoked_at")) {
          role = "create";
          if (this.invitationOwner === "accept") {
            this.creationBlocked.resolve();
            if (this.spaceOwner === "create") throw new Error("deadlock detected");
            await this.invitationReleased.promise;
          }
          this.invitationOwner = role;
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from couple_spaces") && sql.includes("for update")) {
          if (role === "create") this.creationBlocked.resolve();
          if (this.spaceOwner === "create" && role === "accept") await this.spaceReleased.promise;
          this.spaceOwner = role;
          return { rows: [{ id: "space", name: "Casa", archived_at: null }] } as { rows: T[] };
        }
        if (sql.startsWith("select count(*)")) return { rows: [{ member_count: 1 }] } as { rows: T[] };
        if (sql.startsWith("select email from users")) return { rows: [{ email: "bia@example.com" }] } as { rows: T[] };
        if (sql.startsWith("select space_id from memberships")) return { rows: [] } as { rows: T[] };
        return { rows: [] } as { rows: T[] };
      },
      release: () => undefined,
    };
  }

  async query() {
    throw new Error("root queries are not used in this transaction test");
  }
}

async function createStore() {
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({
    name: "octet_length",
    args: [DataType.bytea],
    returns: DataType.integer,
    implementation: () => 32,
  });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await applyMigrations(pool, migrationsDirectory);
  return { pool, store: new PostgresIdentityStore(pool) };
}

describe("PostgresIdentityStore", () => {
  it("updates a Google identity without duplicating its user", async () => {
    const { pool, store } = await createStore();

    const first = await store.upsertGoogleUser({
      id: anaId,
      googleSubject: "google-ana",
      email: "ANA@EXAMPLE.COM",
      name: "Ana",
      avatarUrl: null,
    });
    const updated = await store.upsertGoogleUser({
      id: biaId,
      googleSubject: "google-ana",
      email: "ana.nova@example.com",
      name: "Ana Nova",
      avatarUrl: "https://images.example/ana.png",
    });

    expect(updated).toEqual({
      id: first.id,
      email: "ana.nova@example.com",
      name: "Ana Nova",
      avatarUrl: "https://images.example/ana.png",
    });
    expect((await pool.query("SELECT id FROM users")).rows).toHaveLength(1);
  });

  it("keeps an SQL-shaped email as a plain value", async () => {
    const { pool, store } = await createStore();
    const payload = "' OR 1=1--@example.com";

    await store.upsertGoogleUser({
      id: anaId,
      googleSubject: "sql-payload",
      email: payload,
      name: "' OR 1=1--",
      avatarUrl: null,
    });

    expect((await pool.query("SELECT email, display_name FROM users")).rows).toEqual([
      { email: payload.toLowerCase(), display_name: "' OR 1=1--" },
    ]);
  });

  it("accepts an invitation exactly once and enforces its email binding", async () => {
    const { store } = await createStore();
    await store.upsertGoogleUser({ id: anaId, googleSubject: "ana", email: "ana@example.com", name: "Ana", avatarUrl: null });
    await store.upsertGoogleUser({ id: biaId, googleSubject: "bia", email: "bia@example.com", name: "Bia", avatarUrl: null });
    await store.upsertGoogleUser({ id: claraId, googleSubject: "clara", email: "clara@example.com", name: "Clara", avatarUrl: null });
    const space = await store.createSpace(anaId, "Ana e Bia", new Date("2026-09-04T00:00:00.000Z"));
    const hash = hashOpaqueToken("a".repeat(43));
    await store.createInvitation(anaId, hash, "BIA@EXAMPLE.COM", new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-04T00:00:00.000Z"));

    await expect(store.acceptInvitation(claraId, hash, new Date("2026-09-05T00:00:00.000Z"))).rejects.toThrow("invitation email does not match");
    await store.acceptInvitation(biaId, hash, new Date("2026-09-05T00:00:00.000Z"));
    await expect(store.acceptInvitation(biaId, hash, new Date("2026-09-05T00:00:00.000Z"))).rejects.toThrow("invitation is unavailable");
    expect((await store.getBootstrap(biaId)).space).toEqual({ ...space, memberCount: 2 });
  });

  it("rejects expired invitations and a third member while the space is locked", async () => {
    const { store } = await createStore();
    for (const [id, subject, email, name] of [[anaId, "ana", "ana@example.com", "Ana"], [biaId, "bia", "bia@example.com", "Bia"], [claraId, "clara", "clara@example.com", "Clara"]] as const) {
      await store.upsertGoogleUser({ id, googleSubject: subject, email, name, avatarUrl: null });
    }
    await store.createSpace(anaId, "Casa", new Date("2026-09-04T00:00:00.000Z"));
    const expiredHash = hashOpaqueToken("b".repeat(43));
    await store.createInvitation(anaId, expiredHash, undefined, new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-04T00:00:00.000Z"));
    await expect(store.acceptInvitation(biaId, expiredHash, new Date("2026-09-12T00:00:00.000Z"))).rejects.toThrow("invitation is unavailable");

    const liveHash = hashOpaqueToken("c".repeat(43));
    await store.createInvitation(anaId, liveHash, undefined, new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-04T00:00:00.000Z"));
    await store.acceptInvitation(biaId, liveHash, new Date("2026-09-05T00:00:00.000Z"));
    const thirdHash = hashOpaqueToken("d".repeat(43));
    await store.createInvitation(anaId, thirdHash, undefined, new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-05T00:00:00.000Z"));
    await expect(store.acceptInvitation(claraId, thirdHash, new Date("2026-09-06T00:00:00.000Z"))).rejects.toThrow("space is full");
  });

  it("revokes unused earlier invitations when creating a replacement", async () => {
    const { pool, store } = await createStore();
    await store.upsertGoogleUser({ id: anaId, googleSubject: "ana", email: "ana@example.com", name: "Ana", avatarUrl: null });
    await store.createSpace(anaId, "Casa", new Date("2026-09-04T00:00:00.000Z"));
    const firstHash = hashOpaqueToken("e".repeat(43));
    const replacementHash = hashOpaqueToken("f".repeat(43));
    await store.createInvitation(anaId, firstHash, undefined, new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-04T00:00:00.000Z"));
    await store.createInvitation(anaId, replacementHash, undefined, new Date("2026-09-12T00:00:00.000Z"), new Date("2026-09-05T00:00:00.000Z"));

    expect((await pool.query("SELECT revoked_at FROM invitations WHERE token_hash = $1", [firstHash])).rows[0]).toEqual({ revoked_at: new Date("2026-09-05T00:00:00.000Z") });
  });

  it("serializes accepting and replacing an invitation without a lock cycle", async () => {
    const database = new InvitationLockDatabase();
    const store = new PostgresIdentityStore(database as unknown as Database);
    const acceptedAt = new Date("2026-09-05T00:00:00.000Z");
    const accepting = store.acceptInvitation(biaId, hashOpaqueToken("a".repeat(43)), acceptedAt);

    await database.invitationLocked.promise;
    const replacing = store.createInvitation(anaId, hashOpaqueToken("b".repeat(43)), undefined, new Date("2026-09-12T00:00:00.000Z"), acceptedAt);
    await database.creationBlocked.promise;
    database.allowAcceptance.resolve();

    await expect(Promise.all([accepting, replacing])).resolves.toEqual([undefined, undefined]);
  });
});
