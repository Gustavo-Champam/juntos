// @vitest-environment node
import { createHash, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createOAuthAttempt, validateOAuthCallback } from "./oauth-state";
import { cookieJar } from "./test-cookie-jar";

const key = "test-secret-".repeat(4);
describe("OAuth attempts", () => {
  it("generates independent 256-bit secrets and S256 challenge, consumed once", () => {
    const jar = cookieJar();
    const attempt = createOAuthAttempt(jar, key, 1000);
    for (const value of [attempt.state, attempt.nonce, attempt.codeVerifier]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(value, "base64url")).toHaveLength(32);
    }
    expect(new Set([attempt.state, attempt.nonce, attempt.codeVerifier]).size).toBe(3);
    expect(attempt.codeChallenge).toBe(createHash("sha256").update(attempt.codeVerifier).digest("base64url"));
    const compare = vi.fn(timingSafeEqual);
    expect(validateOAuthCallback(jar, attempt.state, key, 2000, compare)).toMatchObject({ nonce: attempt.nonce, codeVerifier: attempt.codeVerifier });
    expect(compare).toHaveBeenCalled();
    expect(jar.writes.at(-1)).toMatchObject({ name: "oauth", maxAge: 0, path: "/api/auth/google/callback" });
    expect(() => validateOAuthCallback(jar, attempt.state, key, 2000)).toThrow();
    expect(createOAuthAttempt(cookieJar(), key, 1000).state).not.toBe(attempt.state);
  });
  it.each(["missing", "mismatch", "expired", "tampered", "wrong-key", "future"])("rejects %s and consumes cookies", (failure) => {
    const jar = cookieJar();
    const attempt = createOAuthAttempt(jar, key, 1000);
    if (failure === "tampered") jar.set({ ...jar.writes[0], value: jar.writes[0].value + "x" });
    const state = failure === "missing" ? null : failure === "mismatch" ? "z".repeat(43) : attempt.state;
    expect(() => validateOAuthCallback(jar, state, failure === "wrong-key" ? "wrong" : key, failure === "expired" ? 601000 : failure === "future" ? 0 : 2000)).toThrow();
    expect(jar.get("oauth")).toBeUndefined();
  });
});
