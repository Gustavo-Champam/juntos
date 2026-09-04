import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../db/migration-runner.js";
import { hashOpaqueToken } from "../security/tokens.js";
import { PostgresIdentityStore } from "./postgres-identity-store.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
const anaId = "00000000-0000-0000-0000-000000000001";
const biaId = "00000000-0000-0000-0000-000000000002";
const claraId = "00000000-0000-0000-0000-000000000003";

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
});
