import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { clearCookie, cookieConfig, opaqueTokenPattern, type CookieStore } from "./auth-cookies";

type OAuthAttempt = { state: string; nonce: string; codeVerifier: string; issuedAt: number };
type ConstantTimeCompare = typeof timingSafeEqual;

function signature(payload: string, key: string) {
  if (!key) throw new Error("Missing OAuth signing key");
  const signingKey = createHmac("sha256", key).update("juntos:bff:oauth-cookie:v1").digest();
  return createHmac("sha256", signingKey).update(payload).digest();
}

export function createOAuthAttempt(store: CookieStore, key: string, now = Date.now()) {
  const attempt: OAuthAttempt = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(32).toString("base64url"),
    issuedAt: now,
  };
  const payload = Buffer.from(JSON.stringify(attempt)).toString("base64url");
  store.set({ ...cookieConfig("oauth"), value: `${payload}.${signature(payload, key).toString("base64url")}` });
  return { ...attempt, codeChallenge: createHash("sha256").update(attempt.codeVerifier).digest("base64url") };
}

export function validateOAuthCallback(store: CookieStore, state: string | null, key: string, now = Date.now(), compare: ConstantTimeCompare = timingSafeEqual): OAuthAttempt {
  const cookie = store.get(cookieConfig("oauth").name)?.value;
  // Consume before validation or any asynchronous exchange, including every failure path.
  clearCookie(store, "oauth");
  if (!cookie || cookie.length > 2048 || !state || !opaqueTokenPattern.test(state)) throw new Error("Invalid OAuth attempt");
  const parts = cookie.split(".");
  if (parts.length !== 2 || !opaqueTokenPattern.test(parts[1])) throw new Error("Invalid OAuth attempt");
  const [payload, mac] = parts;
  if (!timingSafeEqual(signature(payload, key), Buffer.from(mac, "base64url"))) throw new Error("Invalid OAuth attempt");
  const attempt: OAuthAttempt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!attempt || ![attempt.state, attempt.nonce, attempt.codeVerifier].every((value) => typeof value === "string" && opaqueTokenPattern.test(value)) ||
      !Number.isSafeInteger(attempt.issuedAt) || now < attempt.issuedAt || now - attempt.issuedAt >= 600_000 ||
      !compare(Buffer.from(state), Buffer.from(attempt.state))) throw new Error("Invalid OAuth attempt");
  return attempt;
}
