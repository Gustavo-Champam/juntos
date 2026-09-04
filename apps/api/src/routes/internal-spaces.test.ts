import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { applyMigrations } from "../db/migration-runner.js";
import { PostgresIdentityStore } from "../identity/postgres-identity-store.js";
import { SessionService } from "../identity/session-service.js";
import { SpaceService } from "../spaces/space-service.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
const proxyHeaders = { "x-juntos-proxy-key": "internal-key" };
const apps: Array<ReturnType<typeof buildApp>> = [];

function sequenceUuid() {
  let value = 100;
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
  let tokenIndex = 0;
  const sessionService = new SessionService(store, {
    generateId: nextId,
    generateToken: () => String.fromCharCode(97 + tokenIndex++).repeat(43),
  });
  const spaceService = new SpaceService(store, {
    generateToken: () => "i".repeat(43),
  });
  const googleIdentity = {
    exchange: async ({ code }: { code: string }) => ({
      googleSubject: `subject-${code}`,
      email: `${code}@example.com`,
      name: code[0]?.toUpperCase() + code.slice(1),
      avatarUrl: null,
    }),
  };
  const app = buildApp({
    logger: false,
    webOrigin: "https://web.example.com",
    identity: {
      internalProxyKey: "internal-key",
      googleIdentity,
      sessionService,
      spaceService,
    },
  });
  apps.push(app);
  return app;
}

async function login(app: FastifyInstance, code: string) {
  const response = await app.inject({
    method: "POST",
    url: "/internal/auth/google/exchange",
    headers: proxyHeaders,
    payload: {
      code,
      codeVerifier: "v".repeat(43),
      nonce: `nonce-${code}`,
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ sessionToken: string }>().sessionToken;
}

function privateHeaders(sessionToken: string) {
  return { ...proxyHeaders, authorization: `Bearer ${sessionToken}` };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("internal space routes", () => {
  it("supports the complete two-account space, invitation, acceptance, and leave flow", async () => {
    const app = await createTestApp();
    const anaToken = await login(app, "ana");
    const biaToken = await login(app, "bia");

    const created = await app.inject({
      method: "POST",
      url: "/internal/spaces",
      headers: privateHeaders(anaToken),
      payload: { name: " Casa " },
    });
    expect(created.statusCode).toBe(200);
    expect(created.headers["cache-control"]).toBe("no-store");
    const createdJson = created.json<{
      space: { id: string; name: string; memberCount: number };
    }>();
    expect(createdJson.space).toMatchObject({ name: "Casa", memberCount: 1 });

    const invitation = await app.inject({
      method: "POST",
      url: "/internal/invitations",
      headers: privateHeaders(anaToken),
      payload: { invitedEmail: "BIA@EXAMPLE.COM" },
    });
    expect(invitation.statusCode).toBe(200);
    expect(invitation.headers["cache-control"]).toBe("no-store");
    const invitationJson = invitation.json<{ token: string; expiresAt: string }>();
    expect(invitationJson.token).toBe("i".repeat(43));
    expect(JSON.stringify(invitationJson)).not.toMatch(/token_hash|google/i);

    const accepted = await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: privateHeaders(biaToken),
      payload: { token: invitationJson.token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers["cache-control"]).toBe("no-store");
    expect(accepted.json()).toMatchObject({
      space: { id: createdJson.space.id, name: "Casa", memberCount: 2 },
    });

    for (const sessionToken of [anaToken, biaToken]) {
      const bootstrap = await app.inject({
        method: "GET",
        url: "/internal/bootstrap",
        headers: privateHeaders(sessionToken),
      });
      expect(bootstrap.json()).toMatchObject({
        space: { id: createdJson.space.id, memberCount: 2 },
      });
    }

    const left = await app.inject({
      method: "POST",
      url: "/internal/spaces/leave",
      headers: privateHeaders(biaToken),
    });
    expect(left.statusCode).toBe(200);
    expect(left.headers["cache-control"]).toBe("no-store");
    expect(left.json()).toMatchObject({ space: null });

    const anaAfterLeave = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: privateHeaders(anaToken),
    });
    expect(anaAfterLeave.json()).toMatchObject({
      space: { id: createdJson.space.id, memberCount: 1 },
    });
  });

  it("derives space scope from each authenticated session", async () => {
    const app = await createTestApp();
    const anaToken = await login(app, "ana");
    const carlaToken = await login(app, "carla");

    const anaSpace = await app.inject({
      method: "POST",
      url: "/internal/spaces",
      headers: privateHeaders(anaToken),
      payload: { name: "Casa Ana" },
    });
    const carlaSpace = await app.inject({
      method: "POST",
      url: "/internal/spaces",
      headers: privateHeaders(carlaToken),
      payload: { name: "Casa Carla" },
    });
    const anaSpaceId = anaSpace.json<{ space: { id: string } }>().space.id;
    const carlaSpaceId = carlaSpace.json<{ space: { id: string } }>().space.id;
    expect(carlaSpaceId).not.toBe(anaSpaceId);

    const invite = await app.inject({
      method: "POST",
      url: "/internal/invitations",
      headers: privateHeaders(anaToken),
      payload: {},
    });
    const attemptedCrossSpaceMutation = await app.inject({
      method: "POST",
      url: "/internal/invitations/accept",
      headers: privateHeaders(carlaToken),
      payload: { token: invite.json<{ token: string }>().token },
    });
    expect(attemptedCrossSpaceMutation.statusCode).toBe(400);
    expect(attemptedCrossSpaceMutation.json()).toEqual({ error: "request_failed" });

    const carlaBootstrap = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: privateHeaders(carlaToken),
    });
    expect(carlaBootstrap.json()).toMatchObject({
      space: { id: carlaSpaceId, name: "Casa Carla", memberCount: 1 },
    });
    expect(carlaBootstrap.body).not.toContain(anaSpaceId);
    expect(carlaBootstrap.body).not.toContain("Casa Ana");
  });

  it("uses generic validation failures and authenticates every private mutation", async () => {
    const app = await createTestApp();
    const anaToken = await login(app, "ana");
    const secretInput = "do-not-echo";

    const cases = [
      {
        url: "/internal/spaces",
        headers: privateHeaders(anaToken),
        payload: { name: " ", unexpected: secretInput },
      },
      {
        url: "/internal/invitations",
        headers: privateHeaders(anaToken),
        payload: { invitedEmail: secretInput },
      },
      {
        url: "/internal/invitations/accept",
        headers: privateHeaders(anaToken),
        payload: { token: secretInput },
      },
      {
        url: "/internal/spaces/leave",
        headers: proxyHeaders,
      },
    ];

    for (const testCase of cases) {
      const response = await app.inject({ method: "POST", ...testCase });
      expect(response.statusCode).toBe(
        testCase.url === "/internal/spaces/leave" ? 401 : 400,
      );
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ error: "request_failed" });
      expect(response.body).not.toContain(secretInput);
    }
  });
});
