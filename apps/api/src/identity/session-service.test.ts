import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../db/migration-runner.js";
import { PostgresIdentityStore } from "./postgres-identity-store.js";
import { SessionService } from "./session-service.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
const userId = "00000000-0000-0000-0000-000000000001";

async function createService(clock: { now: Date }) {
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({ name: "octet_length", args: [DataType.bytea], returns: DataType.integer, implementation: () => 32 });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await applyMigrations(pool, migrationsDirectory);
  const store = new PostgresIdentityStore(pool);
  return { pool, service: new SessionService(store, { now: () => clock.now, generateToken: () => "a".repeat(43), generateId: () => userId }) };
}

describe("SessionService", () => {
  it("stores only a hash and authenticates a session for thirty days", async () => {
    const clock = { now: new Date("2026-09-04T00:00:00.000Z") };
    const { pool, service } = await createService(clock);
    const created = await service.createForGoogleIdentity({ googleSubject: "google-ana", email: "ana@example.com", name: "Ana", avatarUrl: null });

    expect(created.sessionToken).toBe("a".repeat(43));
    expect(await service.authenticate(created.sessionToken)).toEqual(created.user);
    const stored = (await pool.query("SELECT token_hash, expires_at FROM sessions")).rows[0] as { token_hash: Buffer; expires_at: Date };
    expect(stored.expires_at).toEqual(new Date("2026-10-04T00:00:00.000Z"));
    expect(stored.token_hash.toString("base64url")).not.toBe(created.sessionToken);
    clock.now = new Date("2026-10-04T00:00:00.000Z");
    expect(await service.authenticate(created.sessionToken)).toBeNull();
  });

  it("does not authenticate malformed, expired, or revoked session tokens", async () => {
    const clock = { now: new Date("2026-09-04T00:00:00.000Z") };
    const { service } = await createService(clock);
    const created = await service.createForGoogleIdentity({ googleSubject: "google-ana", email: "ana@example.com", name: "Ana", avatarUrl: null });

    expect(await service.authenticate("short")).toBeNull();
    await service.revoke(created.sessionToken);
    expect(await service.authenticate(created.sessionToken)).toBeNull();
  });
});
