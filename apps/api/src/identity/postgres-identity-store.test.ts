import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../db/migration-runner.js";
import type { Database } from "../db/pool.js";
import { hashOpaqueToken } from "../security/tokens.js";
import { withMemberTransaction } from "../spaces/member-transaction.js";
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

type TransactionRole = "accept" | "create" | "agenda" | "leave";

class GlobalLockOrderDatabase {
  readonly lockOrder: Record<TransactionRole, string[]> = {
    accept: [],
    create: [],
    agenda: [],
    leave: [],
  };
  private readonly spaceReleased = deferred();
  private connectionIndex = 0;
  private spaceOwner: TransactionRole | null = null;

  constructor(private readonly roles: TransactionRole[]) {}

  async connect() {
    const role = this.roles[this.connectionIndex++];
    if (!role) throw new Error("unexpected transaction");
    return {
      query: async <T>(statement: string) => {
        const sql = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql === "begin") return { rows: [] } as { rows: T[] };
        if (sql === "commit" || sql === "rollback") {
          if (this.spaceOwner === role) {
            this.spaceOwner = null;
            this.spaceReleased.resolve();
          }
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from couple_spaces") && sql.includes("for update")) {
          await this.lockSpace(role);
          return { rows: [{ id: "space", name: "Casa", archived_at: null }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && !sql.includes("for update")) {
          if (role === "accept") return { rows: [] } as { rows: T[] };
          return { rows: [{ space_id: "space", role: "owner" }] } as { rows: T[] };
        }
        if (sql.includes("from invitations") && !sql.includes("for update")) {
          if (role !== "accept") throw new Error("only acceptance discovers an invitation");
          return { rows: [{ id: "invite", space_id: "space" }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && sql.includes("for update")) {
          if (role === "accept" && sql.includes("where user_id = $1")) {
            throw new Error("accept must not lock a foreign-space membership");
          }
          this.lockRelated(role, "membership");
          if (sql.includes("where space_id = $1")) {
            return { rows: [{ user_id: "ana", role: "owner" }] } as { rows: T[] };
          }
          if (role === "accept") return { rows: [] } as { rows: T[] };
          return { rows: [{ space_id: "space", role: "owner" }] } as { rows: T[] };
        }
        if (sql.includes("from invitations") && sql.includes("for update")) {
          this.lockRelated(role, "invitation");
          return { rows: [{ id: "invite", space_id: "space", invited_email: null, expires_at: new Date("2026-10-01T00:00:00.000Z"), accepted_at: null, revoked_at: null }] } as { rows: T[] };
        }
        if (sql.startsWith("update invitations set revoked_at")) {
          this.lockRelated(role, "invitation");
          return { rows: [] } as { rows: T[] };
        }
        if (sql.startsWith("select email from users")) return { rows: [{ email: "bia@example.com" }] } as { rows: T[] };
        if (sql.startsWith("insert into invitations") || sql.startsWith("update invitations set accepted_by")) {
          this.requireSpace(role);
          return { rows: [] } as { rows: T[] };
        }
        if (sql.startsWith("insert into memberships") || sql.startsWith("delete from memberships") || sql.startsWith("update memberships set role") || sql.startsWith("update couple_spaces set archived_at")) {
          this.requireSpace(role);
          return { rows: [] } as { rows: T[] };
        }
        if (sql.startsWith("insert into agenda_state") || sql.includes("from agenda_state")) {
          this.requireSpace(role);
          return { rows: [{ revision: 0 }] } as { rows: T[] };
        }
        throw new Error(`unexpected query for ${role}: ${sql}`);
      },
      release: () => undefined,
    };
  }

  async query(): Promise<never> {
    throw new Error("root queries are not used in lock-order tests");
  }

  private async lockSpace(role: TransactionRole): Promise<void> {
    if (this.spaceOwner && this.spaceOwner !== role) await this.spaceReleased.promise;
    this.spaceOwner = role;
    this.lockOrder[role].push("space");
    await Promise.resolve();
  }

  private lockRelated(role: TransactionRole, kind: "membership" | "invitation"): void {
    this.requireSpace(role);
    this.lockOrder[role].push(kind);
  }

  private requireSpace(role: TransactionRole): void {
    if (this.spaceOwner !== role) throw new Error(`${role} must lock the space first`);
  }
}

type ReciprocalRole = "accept-a" | "accept-b";

class ReciprocalAcceptanceDatabase {
  readonly lockOrder: Record<ReciprocalRole, string[]> = {
    "accept-a": [],
    "accept-b": [],
  };
  private connectionIndex = 0;
  private membershipClaimed = false;

  async connect() {
    const role = (["accept-a", "accept-b"] as const)[this.connectionIndex++];
    if (!role) throw new Error("unexpected transaction");
    const spaceId = role === "accept-a" ? "space-a" : "space-b";
    const inviteId = role === "accept-a" ? "invite-a" : "invite-b";
    return {
      query: async <T>(statement: string) => {
        const sql = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] } as { rows: T[] };
        if (sql.includes("from invitations") && !sql.includes("for update")) {
          return { rows: [{ id: inviteId, space_id: spaceId }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && !sql.includes("for update")) {
          return { rows: [] } as { rows: T[] };
        }
        if (sql.includes("from couple_spaces") && sql.includes("for update")) {
          this.lockOrder[role].push("space");
          return { rows: [{ id: spaceId, name: spaceId, archived_at: null }] } as { rows: T[] };
        }
        if (sql.includes("from memberships") && sql.includes("for update")) {
          if (sql.includes("where user_id = $1")) throw new Error("foreign-space membership lock");
          this.lockOrder[role].push("membership");
          return { rows: [{ user_id: "owner" }] } as { rows: T[] };
        }
        if (sql.includes("from invitations") && sql.includes("for update")) {
          this.lockOrder[role].push("invitation");
          return { rows: [{ id: inviteId, space_id: spaceId, invited_email: null, expires_at: new Date("2026-10-01T00:00:00.000Z"), accepted_at: null, revoked_at: null }] } as { rows: T[] };
        }
        if (sql.startsWith("select email from users")) return { rows: [{ email: "bia@example.com" }] } as { rows: T[] };
        if (sql.startsWith("insert into memberships")) {
          if (this.membershipClaimed) throw Object.assign(new Error("duplicate membership"), { code: "23505" });
          this.membershipClaimed = true;
          return { rows: [] } as { rows: T[] };
        }
        if (sql.startsWith("update invitations set accepted_by")) return { rows: [] } as { rows: T[] };
        throw new Error(`unexpected query for ${role}: ${sql}`);
      },
      release: () => undefined,
    };
  }

  async query(): Promise<never> {
    throw new Error("root queries are not used in reciprocal acceptance tests");
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

  it("serializes accepting and replacing an invitation with global space-first locks", async () => {
    const database = new GlobalLockOrderDatabase(["accept", "create"]);
    const store = new PostgresIdentityStore(database as unknown as Database);
    const acceptedAt = new Date("2026-09-05T00:00:00.000Z");
    const accepting = store.acceptInvitation(biaId, hashOpaqueToken("a".repeat(43)), acceptedAt);
    const replacing = store.createInvitation(anaId, hashOpaqueToken("b".repeat(43)), undefined, new Date("2026-09-12T00:00:00.000Z"), acceptedAt);

    await expect(Promise.all([accepting, replacing])).resolves.toEqual([undefined, undefined]);
    expect(database.lockOrder.accept).toEqual(["space", "membership", "invitation"]);
    expect(database.lockOrder.create).toEqual(["space", "membership", "invitation"]);
  });

  it("serializes leave and agenda work with space-first membership locks", async () => {
    const database = new GlobalLockOrderDatabase(["agenda", "leave"]);
    const store = new PostgresIdentityStore(database as unknown as Database);

    const agenda = withMemberTransaction(database as unknown as Database, anaId, async () => "written");
    const leaving = store.leaveSpace(anaId, new Date("2026-09-05T00:00:00.000Z"));

    await expect(Promise.all([agenda, leaving])).resolves.toEqual(["written", undefined]);
    expect(database.lockOrder.agenda).toEqual(["space", "membership"]);
    expect(database.lockOrder.leave).toEqual(["space", "membership", "membership"]);
  });

  it("prevents reciprocal cross-space accepts from locking foreign memberships", async () => {
    const database = new ReciprocalAcceptanceDatabase();
    const store = new PostgresIdentityStore(database as unknown as Database);
    const acceptedAt = new Date("2026-09-05T00:00:00.000Z");
    const results = await Promise.allSettled([
      store.acceptInvitation(biaId, hashOpaqueToken("a".repeat(43)), acceptedAt),
      store.acceptInvitation(biaId, hashOpaqueToken("b".repeat(43)), acceptedAt),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { message: "user already belongs to a space" } });
    expect(database.lockOrder["accept-a"]).toEqual(["space", "membership", "invitation"]);
    expect(database.lockOrder["accept-b"]).toEqual(["space", "membership", "invitation"]);
  });
});
