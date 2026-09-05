// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { cookies } from "next/headers";
import { cookieJar } from "@/lib/server/test-cookie-jar";
import { createOAuthAttempt } from "@/lib/server/oauth-state";
import { GET as start } from "./google/start/route";
import { GET as callback } from "./google/callback/route";
import { POST as logout } from "./logout/route";
import { GET as bootstrap } from "../bootstrap/route";
import { POST as spaces } from "../spaces/route";
import { POST as leave } from "../spaces/leave/route";
import { POST as invitations } from "../invitations/route";
import { POST as preserve } from "../invitations/preserve/route";
import { POST as accept } from "../invitations/accept/route";

const origin = "https://juntos.example";
const key = "internal-test-secret";
const session = "s".repeat(43);
const token = "t".repeat(43);
const user = { id: "user-1", email: "user@example.com", name: "User", avatarUrl: null };
const data = { user, space: null };
let jar: ReturnType<typeof cookieJar>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function request(path: string, body?: unknown) {
  return new Request(`${origin}${path}`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-juntos-client-id": "f".repeat(64), "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("API_BASE_URL", "https://api.example");
  vi.stubEnv("INTERNAL_PROXY_KEY", key);
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_REDIRECT_URI", `${origin}/api/auth/google/callback`);
  jar = cookieJar({ id: session });
  vi.mocked(cookies).mockImplementation(async () => jar as unknown as Awaited<ReturnType<typeof cookies>>);
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(data));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OAuth routes", () => {
  it("starts Google login with state, nonce and S256 and private ten-minute cookies", async () => {
    const response = await start(new Request(`${origin}/api/auth/google/start`));
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const url = new URL(response.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "google-client", redirect_uri: `${origin}/api/auth/google/callback`, response_type: "code", scope: "openid email profile", code_challenge_method: "S256" });
    for (const name of ["state", "nonce", "code_challenge"]) expect(url.searchParams.get(name)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(jar.writes.find((cookie) => cookie.name === "oauth")).toMatchObject({ maxAge: 600, httpOnly: true, path: "/api/auth/google/callback" });
    expect(url.toString()).not.toContain(key);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("clears OAuth before exchange, sends only code/PKCE/nonce internally and sets opaque session", async () => {
    const attempt = createOAuthAttempt(jar, key);
    fetcher.mockImplementation(async () => {
      expect(jar.get("oauth")).toBeUndefined();
      return Response.json({ ...data, sessionToken: session });
    });
    const response = await callback(new Request(`${origin}/api/auth/google/callback?code=google-code&state=${attempt.state}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(jar.writes.at(-1)).toMatchObject({ name: "id", value: session, httpOnly: true });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.example/internal/auth/google/exchange");
    expect(JSON.parse(init!.body as string)).toEqual({ code: "google-code", codeVerifier: attempt.codeVerifier, nonce: attempt.nonce });
    expect(await response.text()).not.toContain(session);
    const repeat = await callback(new Request(`${origin}/api/auth/google/callback?code=google-code&state=${attempt.state}`));
    expect(repeat.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps an allowlisted invitation return path inside the signed OAuth attempt", async () => {
    const begin = await start(new Request(`${origin}/api/auth/google/start?returnTo=${encodeURIComponent("/convite?retomar=1")}`));
    const state = new URL(begin.headers.get("location")!).searchParams.get("state")!;
    fetcher.mockResolvedValue(Response.json({ ...data, sessionToken: session }));

    const finish = await callback(new Request(`${origin}/api/auth/google/callback?code=google-code&state=${state}`));

    expect(finish.headers.get("location")).toBe(`${origin}/convite?retomar=1`);
    expect(jar.get("oauth")).toBeUndefined();
  });

  it("defaults an unsafe OAuth return path to the home route", async () => {
    const begin = await start(new Request(`${origin}/api/auth/google/start?returnTo=https://evil.example`));
    const state = new URL(begin.headers.get("location")!).searchParams.get("state")!;
    fetcher.mockResolvedValue(Response.json({ ...data, sessionToken: session }));

    const finish = await callback(new Request(`${origin}/api/auth/google/callback?code=google-code&state=${state}`));

    expect(finish.headers.get("location")).toBe(`${origin}/`);
  });

  it.each(["error", "missing-code", "mismatch", "expired"])("fails %s safely and clears OAuth", async (failure) => {
    const attempt = createOAuthAttempt(jar, key, failure === "expired" ? Date.now() - 600001 : Date.now());
    const query = new URLSearchParams({ state: failure === "mismatch" ? "x".repeat(43) : attempt.state });
    if (failure !== "missing-code") query.set("code", "private-code");
    if (failure === "error") query.set("error", "private-google-error");
    const response = await callback(new Request(`${origin}/api/auth/google/callback?${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(jar.get("oauth")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles duplicate snapshots across instances with only one successful authorization-code exchange", async () => {
    const attempt = createOAuthAttempt(jar, key);
    const snapshot = jar.get("oauth")!.value;
    fetcher.mockResolvedValueOnce(Response.json({ ...data, sessionToken: session })).mockResolvedValueOnce(Response.json({ error: "request_failed" }, { status: 400 }));
    const url = `${origin}/api/auth/google/callback?code=one-use-code&state=${attempt.state}`;
    expect((await callback(new Request(url))).status).toBe(303);
    jar = cookieJar({ oauth: snapshot });
    const duplicate = await callback(new Request(url));
    expect(duplicate.status).toBe(400);
    expect(jar.get("id")).toBeUndefined();
    expect(jar.get("oauth")).toBeUndefined();
    expect(await duplicate.json()).toEqual({ error: "request_failed" });
  });
});

const mutations = [
  ["/api/spaces", spaces], ["/api/spaces/leave", leave], ["/api/invitations", invitations],
  ["/api/invitations/preserve", preserve], ["/api/invitations/accept", accept], ["/api/auth/logout", logout],
] as const;
describe("private routes", () => {
  it.each(mutations)("rejects cross-origin %s before reading JSON or modifying cookies", async (path, handler) => {
    const req = request(path, { name: "Us" });
    req.headers.set("origin", "https://evil.example");
    const read = vi.spyOn(req, "json");
    const response = await handler(req);
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(jar.writes).toHaveLength(0);
  });

  it.each([
    ["/api/bootstrap", bootstrap, undefined, "/internal/bootstrap"],
    ["/api/spaces", spaces, { name: "Us" }, "/internal/spaces"],
    ["/api/spaces/leave", leave, undefined, "/internal/spaces/leave"],
    ["/api/invitations", invitations, {}, "/internal/invitations"],
    ["/api/invitations/accept", accept, { token: "forged" }, "/internal/invitations/accept"],
    ["/api/auth/logout", logout, undefined, "/internal/auth/logout"],
  ] as const)("forwards %s with server credentials and cookie-derived identity", async (path, handler, body, internalPath) => {
    jar = cookieJar({ id: session, invitation: token, client: "c".repeat(43) });
    if (path === "/api/invitations") fetcher.mockResolvedValue(Response.json({ token, expiresAt: "2026-09-05T00:00:00.000Z" }));
    if (path === "/api/auth/logout") fetcher.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handler(request(path, body));
    expect(response.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.example${internalPath}`);
    const headers = new Headers(init!.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${session}`);
    expect(headers.get("x-juntos-proxy-key")).toBe(key);
    expect(headers.get("x-juntos-client-id")).toBe(createHash("sha256").update("c".repeat(43)).digest("hex"));
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(init!.cache).toBe("no-store");
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (path === "/api/invitations/accept") {
      expect(JSON.parse(init!.body as string)).toEqual({ token });
      expect(jar.get("invitation")).toBeUndefined();
    }
    expect(await response.text()).not.toContain(session);
  });

  it("preserves a fragment token only in a private cookie, then consumes it on failed acceptance", async () => {
    const response = await preserve(request("/api/invitations/preserve", { token }));
    expect(response.status).toBe(204);
    expect(jar.writes.at(-1)).toMatchObject({ name: "invitation", value: token, httpOnly: true, maxAge: 600, path: "/" });
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(Response.json({ secret: session }, { status: 400 }));
    const result = await accept(request("/api/invitations/accept"));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: "request_failed" });
    expect(jar.get("invitation")).toBeUndefined();
  });

  it("retains a pending invitation when an anonymous visitor must authenticate first", async () => {
    jar = cookieJar({ invitation: token, client: "c".repeat(43) });

    const result = await accept(request("/api/invitations/accept"));

    expect(result.status).toBe(401);
    expect(jar.get("invitation")?.value).toBe(token);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("completes preserve, Google resume, and one invitation acceptance for a new visitor", async () => {
    jar = cookieJar();
    expect((await preserve(request("/api/invitations/preserve", { token }))).status).toBe(204);
    expect((await accept(request("/api/invitations/accept"))).status).toBe(401);
    expect(jar.get("invitation")?.value).toBe(token);

    const begin = await start(new Request(`${origin}/api/auth/google/start?returnTo=%2Fconvite%3Fretomar%3D1`));
    const state = new URL(begin.headers.get("location")!).searchParams.get("state")!;
    fetcher.mockResolvedValueOnce(Response.json({ ...data, sessionToken: session })).mockResolvedValueOnce(Response.json(data));
    expect((await callback(new Request(`${origin}/api/auth/google/callback?code=google-code&state=${state}`))).headers.get("location")).toBe(`${origin}/convite?retomar=1`);

    expect((await accept(request("/api/invitations/accept"))).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(jar.get("invitation")).toBeUndefined();
  });

  it("revokes logout before expiring all auth cookies and clearing browser data", async () => {
    jar = cookieJar({ id: session, oauth: "attempt", invitation: token, client: "c".repeat(43) });
    fetcher.mockImplementation(async () => {
      expect(jar.get("id")?.value).toBe(session);
      return new Response(null, { status: 204 });
    });
    const response = await logout(request("/api/auth/logout"));
    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe('"cache", "cookies", "storage"');
    for (const name of ["id", "oauth", "invitation", "client"]) expect(jar.get(name)).toBeUndefined();
    expect(jar.writes.find((cookie) => cookie.name === "oauth")).toMatchObject({ path: "/api/auth/google/callback", maxAge: 0 });
  });

  it("reports backend revocation failure while clearing browser credentials", async () => {
    fetcher.mockRejectedValue(new Error(`private ${key}`));
    const response = await logout(request("/api/auth/logout"));
    expect(response.status).toBe(502);
    expect(response.headers.get("clear-site-data")).toBe('"cache", "cookies", "storage"');
    expect(jar.get("id")).toBeUndefined();
    expect(await response.json()).toEqual({ error: "request_failed" });
  });

  it("rejects missing sessions and malformed mutation JSON without calling backend", async () => {
    jar = cookieJar();
    expect((await bootstrap()).status).toBe(401);
    jar = cookieJar({ id: session });
    expect((await spaces(request("/api/spaces", { name: "Us", sessionToken: session }))).status).toBe(400);
    expect((await preserve(request("/api/invitations/preserve", { token: "invalid" }))).status).toBe(400);
    expect((await accept(request("/api/invitations/accept", { token }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects backend payloads that could leak session secrets", async () => {
    fetcher.mockResolvedValue(Response.json({ ...data, sessionToken: session }));
    const response = await bootstrap();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "request_failed" });
  });
});
