import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
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
const defaultClientId = "a".repeat(64);
const verifier = "v".repeat(43);
const apps: Array<ReturnType<typeof buildApp>> = [];

function sequenceUuid() {
  let value = 0;
  return () => `00000000-0000-0000-0000-${String(++value).padStart(12, "0")}`;
}

async function createTestApp(options: { logs?: string[] } = {}) {
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
      name: code === "ana" ? "Ana" : "Bia",
      avatarUrl: null,
    }),
  };
  const app = buildApp({
    logger: options.logs
      ? {
          level: "info",
          stream: { write: (entry: string) => options.logs?.push(entry) },
        }
      : false,
    webOrigin: "https://web.example.com",
    identity: {
      internalProxyKey: "internal-key",
      googleIdentity,
      sessionService,
      spaceService,
    },
  });
  apps.push(app);
  return { app, pool };
}

function clientHeaders(clientId = defaultClientId) {
  return { ...proxyHeaders, "x-juntos-client-id": clientId };
}

async function exchange(
  app: ReturnType<typeof buildApp>,
  code = "ana",
  clientId = defaultClientId,
) {
  return app.inject({
    method: "POST",
    url: "/internal/auth/google/exchange",
    headers: clientHeaders(clientId),
    payload: { code, codeVerifier: verifier, nonce: "nonce" },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("internal authentication routes", () => {
  it("exchanges identity, bootstraps from the session, and revokes on logout without exposing secrets", async () => {
    const { app, pool } = await createTestApp();

    const login = await exchange(app);
    expect(login.statusCode).toBe(200);
    expect(login.headers["cache-control"]).toBe("no-store");
    const loginJson = login.json<{
      sessionToken: string;
      user: { id: string; email: string };
      space: null;
    }>();
    expect(loginJson).toMatchObject({
      sessionToken: "a".repeat(43),
      user: { email: "ana@example.com" },
      space: null,
    });
    expect(JSON.stringify(loginJson)).not.toMatch(
      /google.*token|access_token|refresh_token|token_hash/i,
    );

    const storedSession = await pool.query("SELECT token_hash FROM sessions");
    expect(storedSession.rows).toHaveLength(1);
    expect(JSON.stringify(loginJson)).not.toContain(
      (storedSession.rows[0] as { token_hash: Buffer }).token_hash.toString("hex"),
    );

    const authenticatedHeaders = {
      ...clientHeaders(),
      authorization: `Bearer ${loginJson.sessionToken}`,
    };
    const bootstrap = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: authenticatedHeaders,
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers["cache-control"]).toBe("no-store");
    expect(bootstrap.json()).toEqual({ user: loginJson.user, space: null });

    const logout = await app.inject({
      method: "POST",
      url: "/internal/auth/logout",
      headers: authenticatedHeaders,
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["cache-control"]).toBe("no-store");

    const afterLogout = await app.inject({
      method: "GET",
      url: "/internal/bootstrap",
      headers: authenticatedHeaders,
    });
    expect(afterLogout.statusCode).toBe(401);
    expect(afterLogout.headers["cache-control"]).toBe("no-store");
    expect(afterLogout.json()).toEqual({ error: "request_failed" });
  });

  it("returns generic no-store failures for invalid bodies and absent or invalid sessions", async () => {
    const { app } = await createTestApp();
    const invalidInput = "do-not-echo-this-value";

    const invalidBody = await app.inject({
      method: "POST",
      url: "/internal/auth/google/exchange",
      headers: proxyHeaders,
      payload: { code: invalidInput, codeVerifier: "short", nonce: "nonce" },
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["cache-control"]).toBe("no-store");
    expect(invalidBody.json()).toEqual({ error: "request_failed" });
    expect(invalidBody.body).not.toContain(invalidInput);

    for (const authorization of [undefined, "Bearer invalid"]) {
      const response = await app.inject({
        method: "GET",
        url: "/internal/bootstrap",
        headers: {
          ...clientHeaders(),
          ...(authorization ? { authorization } : {}),
        },
      });
      expect(response.statusCode).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ error: "request_failed" });
    }
  });

  it("rejects an oversized auth body with a generic no-store response", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/auth/google/exchange",
      headers: clientHeaders(),
      payload: { code: "x".repeat(17 * 1024), codeVerifier: verifier, nonce: "nonce" },
    });

    expect(response.statusCode).toBe(413);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "request_failed" });
    expect(response.body).not.toContain("x".repeat(100));
  });

  it("does not share an auth rate-limit bucket between trusted BFF client identifiers", async () => {
    const { app } = await createTestApp();

    for (let client = 0; client < 6; client += 1) {
      const response = await exchange(app, `user-${client}`, client.toString(16).repeat(64));
      expect(response.statusCode).toBe(200);
    }
  });

  it("rate limits the sixth Google exchange attempt for one BFF client identifier", async () => {
    const { app } = await createTestApp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await exchange(app);
      expect(response.statusCode).toBe(200);
    }
    const limited = await exchange(app);

    expect(limited.statusCode).toBe(429);
    expect(limited.headers["cache-control"]).toBe("no-store");
    expect(limited.json()).toEqual({ error: "request_failed" });
  });

  it("rejects missing or malformed trusted BFF client identifiers generically", async () => {
    const { app } = await createTestApp();

    for (const clientId of [undefined, "not-a-sha256-hash", "A".repeat(64)]) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/auth/google/exchange",
        headers: {
          ...proxyHeaders,
          ...(clientId ? { "x-juntos-client-id": clientId } : {}),
        },
        payload: { code: "ana", codeVerifier: verifier, nonce: "nonce" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ error: "request_failed" });
    }
  });

  it("returns generic no-store 404 responses for unknown internal paths and wrong methods", async () => {
    const { app } = await createTestApp();
    const canary = "query-canary-must-not-reflect";

    for (const request of [
      { method: "GET" as const, url: `/internal/missing?canary=${canary}` },
      { method: "GET" as const, url: `/internal/auth/google/exchange?canary=${canary}` },
    ]) {
      const response = await app.inject({ ...request, headers: clientHeaders() });

      expect(response.statusCode).toBe(404);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ error: "request_failed" });
      expect(response.body).not.toContain(canary);
    }
  });

  it("logs only explicit safe security-event fields", async () => {
    const logs: string[] = [];
    const { app } = await createTestApp({ logs });
    const queryCanary = "query-canary";
    const codeCanary = "code-canary";
    const tokenCanary = `canary${"a".repeat(37)}`;

    const response = await app.inject({
      method: "POST",
      url: `/internal/auth/google/exchange?canary=${queryCanary}`,
      headers: {
        ...clientHeaders(),
        authorization: `Bearer ${tokenCanary}`,
      },
      payload: { code: codeCanary, codeVerifier: "short", nonce: "nonce" },
    });

    expect(response.statusCode).toBe(400);
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).toContain("request_failed");
    for (const canary of [queryCanary, codeCanary, tokenCanary]) {
      expect(logs.join("\n")).not.toContain(canary);
    }
  });

  it("uses exact CORS and restrictive security headers without identifying the framework", async () => {
    const { app } = await createTestApp();

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://web.example.com" },
    });
    const denied = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://attacker.example.com" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://web.example.com",
    );
    expect(denied.headers["access-control-allow-origin"]).toBe(
      "https://web.example.com",
    );
    expect(denied.headers["access-control-allow-origin"]).not.toBe(
      "https://attacker.example.com",
    );
    expect(allowed.headers["content-security-policy"]).toBeDefined();
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();
    expect(allowed.headers.server).toBeUndefined();
  });
});
