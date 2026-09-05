import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { applyMigrations } from "../db/migration-runner.js";
import { PostgresIdentityStore } from "./postgres-identity-store.js";
import { SessionService } from "./session-service.js";
import { SpaceService } from "../spaces/space-service.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
const proxyHeaders = {
  "x-juntos-proxy-key": "internal-key",
  "x-juntos-client-id": "a".repeat(64),
};
const apps: Array<ReturnType<typeof buildApp>> = [];

function sequenceUuid() {
  let value = 0;
  return () => `00000000-0000-0000-0000-${String(++value).padStart(12, "0")}`;
}

async function createTestApp() {
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
  const nextId = sequenceUuid();
  const store = new PostgresIdentityStore(pool, { generateId: nextId });
  let sessionIndex = 0;
  const sessionService = new SessionService(store, {
    generateId: nextId,
    generateToken: () => String.fromCharCode(97 + sessionIndex++).repeat(43),
  });
  let invitationIndex = 0;
  const spaceService = new SpaceService(store, {
    generateToken: () => String.fromCharCode(105 + invitationIndex++).repeat(43),
  });
  const app = buildApp({
    logger: false,
    webOrigin: "https://web.example.com",
    identity: {
      internalProxyKey: "internal-key",
      googleIdentity: {
        exchange: async ({ code }: { code: string }) => ({
          googleSubject: `google-${code}`,
          email: `${code}@example.com`,
          name: code[0]?.toUpperCase() + code.slice(1),
          avatarUrl: null,
        }),
      },
      sessionService,
      spaceService,
    },
  });
  apps.push(app);
  return { app, pool };
}

function authenticatedHeaders(token: string) {
  return { ...proxyHeaders, authorization: `Bearer ${token}` };
}

async function login(app: ReturnType<typeof buildApp>, identity: string) {
  const response = await app.inject({
    method: "POST",
    url: "/internal/auth/google/exchange",
    headers: proxyHeaders,
    payload: {
      code: identity,
      codeVerifier: "v".repeat(43),
      nonce: `nonce-${identity}`,
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ sessionToken: string }>().sessionToken;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("two-person identity lifecycle", () => {
  it("keeps two verified people in one space, rejects reuse and a third member, then revokes a leaving member session", async () => {
    const { app, pool } = await createTestApp();
    const anaToken = await login(app, "ana");

    const created = await app.inject({
      method: "POST",
      url: "/internal/spaces",
      headers: authenticatedHeaders(anaToken),
      payload: { name: "Ana e Bia" },
    });
    expect(created.statusCode).toBe(200);
    const spaceId = created.json<{ space: { id: string } }>().space.id;

    const invitation = await app.inject({
      method: "POST",
      url: "/internal/invitations",
      headers: authenticatedHeaders(anaToken),
      payload: {},
    });
    expect(invitation.statusCode).toBe(200);
    const invitationToken = invitation.json<{ token: string }>().token;

    const biaToken = await login(app, "bia");
    const accepted = await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: authenticatedHeaders(biaToken),
      payload: { token: invitationToken },
    });
    expect(accepted.statusCode).toBe(200);

    for (const token of [anaToken, biaToken]) {
      const bootstrap = await app.inject({
        method: "GET",
        url: "/internal/bootstrap",
        headers: authenticatedHeaders(token),
      });
      expect(bootstrap.statusCode).toBe(200);
      expect(bootstrap.json()).toMatchObject({
        space: { id: spaceId, memberCount: 2 },
      });
    }

    const reused = await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: authenticatedHeaders(biaToken),
      payload: { token: invitationToken },
    });
    expect(reused.statusCode).toBe(400);

    const thirdInvitation = await app.inject({
      method: "POST",
      url: "/internal/invitations",
      headers: authenticatedHeaders(anaToken),
      payload: {},
    });
    const claraToken = await login(app, "clara");
    const thirdMember = await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: authenticatedHeaders(claraToken),
      payload: { token: thirdInvitation.json<{ token: string }>().token },
    });
    expect(thirdMember.statusCode).toBe(400);

    const left = await app.inject({
      method: "POST",
      url: "/internal/spaces/leave",
      headers: authenticatedHeaders(biaToken),
    });
    expect(left.statusCode).toBe(200);
    expect(left.json()).toMatchObject({ space: null });

    const anaAfterLeave = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: authenticatedHeaders(anaToken),
    });
    expect(anaAfterLeave.json()).toMatchObject({
      space: { id: spaceId, memberCount: 1 },
    });

    const logout = await app.inject({
      method: "POST",
      url: "/internal/auth/logout",
      headers: authenticatedHeaders(biaToken),
    });
    expect(logout.statusCode).toBe(204);
    const revoked = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: authenticatedHeaders(biaToken),
    });
    expect(revoked.statusCode).toBe(401);

    const storedSessions = await pool.query(
      "SELECT token_hash FROM sessions",
    ) as { rows: Array<{ token_hash: Buffer }> };
    const storedInvitations = await pool.query(
      "SELECT token_hash FROM invitations",
    ) as { rows: Array<{ token_hash: Buffer }> };
    expect(storedSessions.rows).toHaveLength(3);
    expect(storedInvitations.rows).toHaveLength(2);
    expect(JSON.stringify(storedSessions.rows)).not.toContain(anaToken);
    expect(JSON.stringify(storedSessions.rows)).not.toContain(biaToken);
    expect(JSON.stringify(storedInvitations.rows)).not.toContain(invitationToken);
  });

  it("promotes the remaining partner to owner when the owner leaves", async () => {
    const { app, pool } = await createTestApp();
    const anaToken = await login(app, "ana");
    const biaToken = await login(app, "bia");
    await app.inject({
      method: "POST",
      url: "/internal/spaces",
      headers: authenticatedHeaders(anaToken),
      payload: { name: "Ana e Bia" },
    });
    const invitation = await app.inject({
      method: "POST",
      url: "/internal/invitations",
      headers: authenticatedHeaders(anaToken),
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: authenticatedHeaders(biaToken),
      payload: { token: invitation.json<{ token: string }>().token },
    });

    const left = await app.inject({
      method: "POST",
      url: "/internal/spaces/leave",
      headers: authenticatedHeaders(anaToken),
    });
    expect(left.statusCode).toBe(200);
    expect(
      await pool.query(
        "SELECT role FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = $1)",
        ["bia@example.com"],
      ) as { rows: Array<{ role: string }> },
    ).toMatchObject({ rows: [{ role: "owner" }] });
  });
});
