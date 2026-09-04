import "server-only";
import { createHash, randomBytes } from "node:crypto";

export type CookieKind = "session" | "oauth" | "invitation" | "client";
export type AuthCookie = ReturnType<typeof cookieConfig> & { value: string };
export type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(cookie: AuthCookie): unknown;
};
export const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-id" : "id";

export function cookieConfig(kind: CookieKind, production = process.env.NODE_ENV === "production") {
  const name = { session: "id", oauth: "oauth", invitation: "invitation", client: "client" }[kind];
  return {
    name: production ? `${kind === "oauth" ? "__Secure-" : "__Host-"}${name}` : name,
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: kind === "oauth" ? "/api/auth/google/callback" : "/",
    maxAge: kind === "oauth" || kind === "invitation" ? 600 : 60 * 60 * 24 * 30,
  };
}

export function clearCookie(store: CookieStore, kind: CookieKind) {
  store.set({ ...cookieConfig(kind), value: "", maxAge: 0 });
}

export function setSessionCookie(store: CookieStore, token: string, production = process.env.NODE_ENV === "production") {
  if (!opaqueTokenPattern.test(token)) throw new Error("Invalid session");
  store.set({ ...cookieConfig("session", production), value: token });
}

export function getClientId(store: CookieStore, production = process.env.NODE_ENV === "production") {
  const options = cookieConfig("client", production);
  let value = store.get(options.name)?.value;
  if (!value || !opaqueTokenPattern.test(value)) {
    value = randomBytes(32).toString("base64url");
    store.set({ ...options, value });
  }
  return createHash("sha256").update(value).digest("hex");
}
