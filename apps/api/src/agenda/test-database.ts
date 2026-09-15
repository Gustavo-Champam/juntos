import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import type { Pool } from "pg";

import { applyMigrations } from "../db/migration-runner.js";
import { PostgresIdentityStore } from "../identity/postgres-identity-store.js";
import { generateOpaqueToken, hashOpaqueToken } from "../security/tokens.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));

const anaId = "00000000-0000-0000-0000-000000000001";
const biaId = "00000000-0000-0000-0000-000000000002";
const claraId = "00000000-0000-0000-0000-000000000003";
const createdAt = new Date("2026-09-05T12:00:00.000Z");
const expiresAt = new Date("2026-09-12T12:00:00.000Z");

export async function createAgendaTestDatabase(): Promise<{
  pool: Pool;
  identity: PostgresIdentityStore;
  anaId: string;
  biaId: string;
  claraId: string;
}> {
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

  const identity = new PostgresIdentityStore(pool);
  await identity.upsertGoogleUser({ id: anaId, googleSubject: "google-ana", email: "ana@example.com", name: "Ana", avatarUrl: null });
  await identity.upsertGoogleUser({ id: biaId, googleSubject: "google-bia", email: "bia@example.com", name: "Bia", avatarUrl: null });
  await identity.upsertGoogleUser({ id: claraId, googleSubject: "google-clara", email: "clara@example.com", name: "Clara", avatarUrl: null });

  await identity.createSpace(anaId, "Ana e Bia", createdAt);
  const invitation = generateOpaqueToken();
  await identity.createInvitation(anaId, hashOpaqueToken(invitation), "bia@example.com", expiresAt, createdAt);
  await identity.acceptInvitation(biaId, hashOpaqueToken(invitation), createdAt);
  await identity.createSpace(claraId, "Clara", createdAt);

  return { pool, identity, anaId, biaId, claraId };
}
