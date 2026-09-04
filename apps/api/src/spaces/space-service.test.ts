import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../db/migration-runner.js";
import { PostgresIdentityStore } from "../identity/postgres-identity-store.js";
import { SpaceService } from "./space-service.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
const anaId = "00000000-0000-0000-0000-000000000001";
const biaId = "00000000-0000-0000-0000-000000000002";

async function createService(now: Date) {
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({ name: "octet_length", args: [DataType.bytea], returns: DataType.integer, implementation: () => 32 });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await applyMigrations(pool, migrationsDirectory);
  const store = new PostgresIdentityStore(pool);
  await store.upsertGoogleUser({ id: anaId, googleSubject: "ana", email: "ana@example.com", name: "Ana", avatarUrl: null });
  await store.upsertGoogleUser({ id: biaId, googleSubject: "bia", email: "bia@example.com", name: "Bia", avatarUrl: null });
  return { service: new SpaceService(store, { now: () => now, generateToken: () => "a".repeat(43) }) };
}

describe("SpaceService", () => {
  it("prevents a user from creating a second space", async () => {
    const { service } = await createService(new Date("2026-09-04T00:00:00.000Z"));
    await service.createSpace(anaId, "Casa");

    await expect(service.createSpace(anaId, "Outra casa")).rejects.toThrow("user already belongs to a space");
  });

  it("issues seven-day invitations, accepts them, and archives an empty space on leave", async () => {
    const now = new Date("2026-09-04T00:00:00.000Z");
    const { service } = await createService(now);
    await service.createSpace(anaId, "Casa");
    const invitation = await service.createInvitation(anaId, "BIA@EXAMPLE.COM");

    expect(invitation).toEqual({ token: "a".repeat(43), expiresAt: "2026-09-11T00:00:00.000Z" });
    expect((await service.acceptInvitation(biaId, invitation.token)).space?.memberCount).toBe(2);
    expect((await service.leaveSpace(biaId)).space).toBeNull();
    expect((await service.getBootstrap(anaId)).space?.memberCount).toBe(1);
    await service.leaveSpace(anaId);
    expect((await service.getBootstrap(anaId)).space).toBeNull();
  });
});
