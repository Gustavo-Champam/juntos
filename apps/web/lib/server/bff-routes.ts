import "server-only";
import { cookies } from "next/headers";
import {
  acceptInvitationRequestSchema,
  bootstrapSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  createSpaceRequestSchema,
  googleExchangeRequestSchema,
  googleExchangeResponseSchema,
} from "@juntos/contracts";
import { backendFetch } from "./api-client";
import { clearCookie, cookieConfig, getClientId, opaqueTokenPattern, setSessionCookie, type CookieStore } from "./auth-cookies";
import { createOAuthAttempt, validateOAuthCallback } from "./oauth-state";
import { assertSameOrigin, SameOriginError } from "./same-origin";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
type Schema = { parse(value: unknown): unknown };
class RequestFailure extends Error {
  constructor(readonly status: number) { super("request_failed"); }
}

function failure(error: unknown) {
  const status = error instanceof SameOriginError ? 403 : error instanceof RequestFailure ? error.status : 502;
  return Response.json({ error: "request_failed" }, { status, headers: privateHeaders });
}

function seeOther(url: string | URL) {
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: String(url) } });
}

function safeReturnPath(value: string | null): "/" | "/convite?retomar=1" {
  return value === "/convite?retomar=1" ? value : "/";
}

function sessionFrom(store: CookieStore) {
  const session = store.get(cookieConfig("session").name)?.value;
  if (!session || !opaqueTokenPattern.test(session)) throw new RequestFailure(401);
  return session;
}

async function parseBody(request: Request, schema: Schema) {
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("Expected JSON");
    return schema.parse(await request.json());
  } catch {
    throw new RequestFailure(400);
  }
}

async function proxy(path: string, session: string, method: string, body: unknown, schema: Schema) {
  const response = await backendFetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  }, session);
  if (!response.ok) throw new RequestFailure(response.status >= 400 && response.status < 500 ? response.status : 502);
  return Response.json(schema.parse(await response.json()), { headers: privateHeaders });
}

export async function startGoogle(request: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const key = process.env.INTERNAL_PROXY_KEY;
    if (!clientId || !redirectUri || !key) throw new RequestFailure(503);
    const redirect = new URL(redirectUri);
    if (redirect.origin !== new URL(request.url).origin || redirect.pathname !== "/api/auth/google/callback" || redirect.search || redirect.hash) throw new RequestFailure(503);
    const store = await cookies();
    const attempt = createOAuthAttempt(store, key, Date.now(), safeReturnPath(new URL(request.url).searchParams.get("returnTo")));
    getClientId(store);
    const destination = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    destination.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: attempt.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return seeOther(destination);
  } catch (error) { return failure(error); }
}

export async function googleCallback(request: Request) {
  const store = await cookies();
  try {
    const query = new URL(request.url).searchParams;
    let attempt;
    try {
      attempt = validateOAuthCallback(store, query.get("state"), process.env.INTERNAL_PROXY_KEY ?? "");
      if (query.has("error") || query.getAll("state").length !== 1 || query.getAll("code").length !== 1) throw new Error("Invalid callback");
    } catch { throw new RequestFailure(400); }
    const parsed = googleExchangeRequestSchema.safeParse({ code: query.get("code"), nonce: attempt.nonce, codeVerifier: attempt.codeVerifier });
    if (!parsed.success) throw new RequestFailure(400);
    const response = await backendFetch("/internal/auth/google/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
    });
    // Across instances, Google atomically consumes the authorization code with PKCE.
    // Clearing the authenticated cookie consumes this browser's local attempt.
    if (!response.ok) throw new RequestFailure(response.status >= 400 && response.status < 500 ? 400 : 502);
    const payload = googleExchangeResponseSchema.parse(await response.json());
    setSessionCookie(store, payload.sessionToken);
    return seeOther(new URL(attempt.returnTo, request.url));
  } catch (error) { return failure(error); }
}

export async function getBootstrap() {
  try {
    return await proxy("/internal/bootstrap", sessionFrom(await cookies()), "GET", undefined, bootstrapSchema);
  } catch (error) { return failure(error); }
}

function mutation(path: string, requestSchema?: Schema, responseSchema: Schema = bootstrapSchema) {
  return async (request: Request) => {
    try {
      assertSameOrigin(request);
      const session = sessionFrom(await cookies());
      const body = requestSchema ? await parseBody(request, requestSchema) : undefined;
      return await proxy(path, session, "POST", body, responseSchema);
    } catch (error) { return failure(error); }
  };
}

export const createSpace = mutation("/internal/spaces", createSpaceRequestSchema);
export const leaveSpace = mutation("/internal/spaces/leave");
export const createInvitation = mutation("/internal/invitations", createInvitationRequestSchema, createInvitationResponseSchema);

export async function preserveInvitation(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = await parseBody(request, acceptInvitationRequestSchema) as { token: string };
    if (!opaqueTokenPattern.test(parsed.token)) throw new RequestFailure(400);
    (await cookies()).set({ ...cookieConfig("invitation"), value: parsed.token });
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function acceptInvitation(request: Request) {
  try {
    assertSameOrigin(request);
    const store = await cookies();
    const session = sessionFrom(store);
    const token = store.get(cookieConfig("invitation").name)?.value;
    if (!token || !opaqueTokenPattern.test(token)) throw new RequestFailure(400);
    clearCookie(store, "invitation");
    return await proxy("/internal/invitations/accept", session, "POST", { token }, bootstrapSchema);
  } catch (error) { return failure(error); }
}

export async function logout(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return failure(error); }
  const store = await cookies();
  let result: Response;
  try {
    const session = store.get(cookieConfig("session").name)?.value;
    if (session && opaqueTokenPattern.test(session)) {
      const response = await backendFetch("/internal/auth/logout", { method: "POST" }, session);
      if (!response.ok && response.status !== 401) throw new RequestFailure(502);
    }
    result = new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) { result = failure(error); }
  finally {
    for (const kind of ["session", "oauth", "invitation", "client"] as const) clearCookie(store, kind);
  }
  result.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  return result;
}
