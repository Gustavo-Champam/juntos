// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cookieConfig, getClientId, setSessionCookie } from "./auth-cookies";
import { cookieJar } from "./test-cookie-jar";

describe("auth cookies", () => {
  it("sets a thirty-day production session with host-only protection", () => {
    const jar = cookieJar();
    setSessionCookie(jar, "s".repeat(43), true);
    expect(jar.writes[0]).toEqual({ name: "__Host-id", value: "s".repeat(43), httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 });
    expect(() => setSessionCookie(jar, "invalid", true)).toThrow();
  });
  it("scopes OAuth to callback and expires pending invitations in ten minutes", () => {
    expect(cookieConfig("oauth", true)).toEqual({ name: "__Secure-oauth", httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google/callback", maxAge: 600 });
    expect(cookieConfig("invitation", true)).toEqual({ name: "__Host-invitation", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    expect(cookieConfig("session", false)).toMatchObject({ name: "id", secure: false, path: "/" });
  });
  it("creates a persistent random browser identity and derives the trusted hash only from it", () => {
    const jar = cookieJar();
    const id = getClientId(jar, true);
    const cookie = jar.writes[0];
    expect(cookie).toMatchObject({ name: "__Host-client", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 });
    expect(Buffer.from(cookie.value, "base64url")).toHaveLength(32);
    expect(id).toBe(createHash("sha256").update(cookie.value).digest("hex"));
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(getClientId(jar, true)).toBe(id);
    expect(jar.writes).toHaveLength(1);
    expect(getClientId(cookieJar(), true)).not.toBe(id);
  });
});
