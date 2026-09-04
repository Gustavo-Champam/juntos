# Juntos Identity and Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Juntos privately usable by two people on different devices through Google login, opaque sessions, a shared couple space, and a one-use invitation.

**Architecture:** Keep the browser on the Vercel origin and use Next.js route handlers as a backend-for-frontend. Google returns to the Next.js callback; the callback sends the authorization code, PKCE verifier, and nonce to the Render API through an authenticated server-to-server request. The API verifies Google identity, persists users and SHA-256 hashes of opaque session/invitation tokens in PostgreSQL, and applies every membership rule inside database transactions.

**Tech Stack:** Node.js 22, TypeScript, Next.js 16 App Router, React 19, Fastify 5, PostgreSQL, `pg`, `pg-mem`, Zod, `google-auth-library`, `@fastify/helmet`, `@fastify/rate-limit`, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-03-agenda-cardapio-casal-design.md`

## Global Constraints

- The browser calls only same-origin Next.js routes; the Render API hostname and internal proxy key never enter client JavaScript.
- Google login requests only `openid email profile`; Google Calendar permission remains a separate consent flow.
- Production sessions use an opaque 256-bit token in a `__Host-` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.
- PostgreSQL stores only SHA-256 token hashes, never raw session or invitation tokens.
- A user belongs to at most one couple space, and a couple space contains at most two members.
- Both members have equal product permissions. The `owner` and `partner` labels exist only for membership lifecycle rules.
- Invitations expire after seven days, are single-use, and optionally bind to a normalized Google email.
- Every database query is parameterized and every shared-data lookup derives the space identifier from the authenticated session, not from browser input.
- Auth, invitation, and mutation endpoints are rate-limited; authentication errors do not reveal whether an account exists.
- Authentication and private data responses use `Cache-Control: no-store`; the service worker continues to ignore `/api/*`.
- Never log authorization codes, Google tokens, session tokens, invitation tokens, cookies, or the internal proxy key.
- The existing calm chronological home and exact four-item navigation remain unchanged for authenticated members.

## Security Model

The protected surface is the public Render service, the Vercel route handlers,
OAuth callback parameters, opaque cookies, invite links, and every record keyed
by a couple space. Controls are: a constant-time internal-key guard on all
`/internal/*` API routes, Google ID-token verification, PKCE, state and nonce,
server-generated random tokens, hash-at-rest, short invitation expiry,
transactional membership capacity checks, same-origin validation on browser
mutations, security headers, request size limits, rate limits, and generic error
responses. Logout revokes the server record before clearing the cookie.

Primary references:

- Google OpenID Connect server flow: `https://developers.google.com/identity/openid-connect/openid-connect`
- Google OAuth web-server flow: `https://developers.google.com/identity/protocols/oauth2/web-server`
- OWASP session guidance: `https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`
- Next.js backend-for-frontend guide: `https://nextjs.org/docs/app/guides/backend-for-frontend`

---

### Task 1: Define the identity and onboarding contracts

**Files:**

- Create: `packages/contracts/src/identity.ts`
- Create: `packages/contracts/src/identity.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces: `publicUserSchema`, `coupleSpaceSchema`, `bootstrapSchema`, `googleExchangeRequestSchema`, `googleExchangeResponseSchema`, `createSpaceRequestSchema`, `createInvitationRequestSchema`, `createInvitationResponseSchema`, `acceptInvitationRequestSchema`, and their inferred types.
- Consumes: Zod from the existing contracts package.

- [ ] **Step 1: Write the failing schema tests**

Cover exact acceptance and rejection cases:

```ts
expect(publicUserSchema.parse({
  id: "9ee4dcca-a009-4a90-b8dc-e44e2d912c5d",
  email: "ana@example.com",
  name: "Ana",
  avatarUrl: null,
})).toEqual(expect.objectContaining({ name: "Ana" }));

expect(() => createSpaceRequestSchema.parse({ name: " " })).toThrow();
expect(() => acceptInvitationRequestSchema.parse({ token: "short" })).toThrow();
expect(() => googleExchangeRequestSchema.parse({
  code: "code",
  codeVerifier: "too-short",
  nonce: "nonce",
})).toThrow();
```

Invitation tokens and OAuth state values use URL-safe strings with bounded
lengths. Names are trimmed and limited to 80 characters. Email values are
lowercase and at most 254 characters.

- [ ] **Step 2: Run the contract test and observe the missing exports**

Run:

```powershell
npm --workspace @juntos/contracts test -- identity
```

Expected: FAIL because `identity.ts` and the exported schemas do not exist.

- [ ] **Step 3: Implement the schemas and types**

Use these public shapes:

```ts
type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

type CoupleSpace = {
  id: string;
  name: string;
  memberCount: 1 | 2;
};

type Bootstrap = {
  user: PublicUser;
  space: CoupleSpace | null;
};
```

The internal Google exchange response adds `sessionToken: string`; it is used
only between the Vercel server and Render.

- [ ] **Step 4: Run tests and typecheck**

```powershell
npm --workspace @juntos/contracts test -- identity
npm --workspace @juntos/contracts run typecheck
```

Expected: all identity tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```powershell
git add packages/contracts/src
git commit -m "feat: define identity contracts"
```

---

### Task 2: Add PostgreSQL migrations and a testable database boundary

**Files:**

- Create: `apps/api/migrations/0001_identity.sql`
- Create: `apps/api/src/db/pool.ts`
- Create: `apps/api/src/db/migration-runner.ts`
- Create: `apps/api/src/db/migration-runner.test.ts`
- Create: `apps/api/src/db/migrate.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `render.yaml`
- Modify: `tests/deployment-contract.test.mjs`

**Interfaces:**

- Produces: `Database = Pick<Pool, "query" | "connect">`, `createPool(databaseUrl, ssl)`, and `applyMigrations(pool, migrationsDirectory)`.
- Consumes: `DATABASE_URL` and `DATABASE_SSL` from validated configuration.

- [ ] **Step 1: Add the failing migration and configuration tests**

Use `pg-mem` to execute the real migration. Assert all five tables exist and
reject invalid UUID relationships:

```ts
const tables = await pool.query<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);

expect(tables.rows.map((row) => row.table_name)).toEqual([
  "couple_spaces",
  "invitations",
  "memberships",
  "schema_migrations",
  "sessions",
  "users",
]);
```

Configuration tests must require `DATABASE_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `INTERNAL_PROXY_KEY` in
production while retaining safe test defaults only under `NODE_ENV=test`.

- [ ] **Step 2: Run the targeted tests and observe failure**

```powershell
npm --workspace @juntos/api test -- migration-runner config
```

Expected: FAIL because the migration boundary and new configuration fields do
not exist.

- [ ] **Step 3: Create the identity schema**

`0001_identity.sql` creates:

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  google_subject varchar(255) NOT NULL UNIQUE,
  email varchar(254) NOT NULL,
  display_name varchar(120) NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email))
);

CREATE TABLE couple_spaces (
  id uuid PRIMARY KEY,
  name varchar(80) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE memberships (
  space_id uuid NOT NULL REFERENCES couple_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('owner', 'partner')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_hash_length CHECK (octet_length(token_hash) = 32)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  invited_email varchar(254),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_normalized
    CHECK (invited_email IS NULL OR invited_email = lower(invited_email)),
  CONSTRAINT invitations_hash_length CHECK (octet_length(token_hash) = 32)
);
```

Add targeted B-tree indexes for active session hashes, active invitation
hashes, `memberships(space_id)`, and `sessions(user_id, expires_at)`. Do not add
indexes for unimplemented agenda or meal queries.

- [ ] **Step 4: Implement migration execution and deployment wiring**

The runner creates `schema_migrations`, sorts embedded `.sql` filenames,
records each applied migration in the same transaction, and never interpolates
request data. Add:

```json
"db:migrate": "tsx src/db/migrate.ts"
```

Add this Render service field and lock it in the deployment test:

```yaml
preDeployCommand: npm --workspace @juntos/api run db:migrate
```

- [ ] **Step 5: Run migration, configuration, and deployment tests**

```powershell
npm --workspace @juntos/api test -- migration-runner config
npm run test:deploy
npm --workspace @juntos/api run typecheck
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/migrations apps/api/src/db apps/api/src/config.ts apps/api/src/config.test.ts apps/api/package.json render.yaml tests package.json package-lock.json
git commit -m "feat: add identity database schema"
```

---

### Task 3: Implement users, opaque sessions, spaces, and invitation storage

**Files:**

- Create: `apps/api/src/security/tokens.ts`
- Create: `apps/api/src/security/tokens.test.ts`
- Create: `apps/api/src/identity/identity-store.ts`
- Create: `apps/api/src/identity/postgres-identity-store.ts`
- Create: `apps/api/src/identity/postgres-identity-store.test.ts`
- Create: `apps/api/src/identity/session-service.ts`
- Create: `apps/api/src/identity/session-service.test.ts`
- Create: `apps/api/src/spaces/space-service.ts`
- Create: `apps/api/src/spaces/space-service.test.ts`

**Interfaces:**

- Produces: `generateOpaqueToken(): string`, `hashOpaqueToken(token): Buffer`, `IdentityStore`, `SessionService`, and `SpaceService`.
- Consumes: the PostgreSQL boundary and shared identity contract types.

- [ ] **Step 1: Write failing token tests**

Assert that two generated tokens differ, decode to 32 bytes, contain only
base64url characters, and hash deterministically to 32 bytes. Assert that raw
tokens never equal their stored hash representation.

- [ ] **Step 2: Implement token generation**

Use only Node cryptography:

```ts
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
```

- [ ] **Step 3: Write failing store and service tests**

Run the real migration in `pg-mem`, then cover:

- Google-subject upsert updates display data without duplicating a user;
- a session stores only the token hash and expires after 30 days;
- expired and revoked sessions do not authenticate;
- a user cannot create a second space;
- a locked space transaction rejects a third member;
- an invitation works once, expires after seven days, and rejects a different
  Google email when `invitedEmail` is present;
- creating a replacement invitation revokes earlier unused invitations;
- SQL payloads such as `' OR 1=1--` remain plain values.

Use an injected clock and token generator so expiry behavior is deterministic.

- [ ] **Step 4: Implement the parameterized PostgreSQL store**

Every public store method receives a user identifier from an authenticated
session. Use explicit column lists and positional parameters. The acceptance
transaction must execute in this order:

```sql
SELECT id, space_id, invited_email, expires_at, accepted_at, revoked_at
FROM invitations
WHERE token_hash = $1
FOR UPDATE;

SELECT id FROM couple_spaces WHERE id = $1 FOR UPDATE;

SELECT count(*)::int AS member_count
FROM memberships
WHERE space_id = $1;
```

Only after all checks pass may it insert the partner membership and mark the
invitation accepted. Roll back on every failure.

- [ ] **Step 5: Implement the services**

`SessionService.createForGoogleIdentity()` upserts the user, creates a random
session, stores its hash, and returns the raw token once. `authenticate()`
validates token format before hashing it. `SpaceService` exposes:

```ts
createSpace(userId: string, name: string): Promise<Bootstrap>;
createInvitation(
  userId: string,
  invitedEmail?: string,
): Promise<{ token: string; expiresAt: string }>;
acceptInvitation(userId: string, token: string): Promise<Bootstrap>;
leaveSpace(userId: string): Promise<Bootstrap>;
getBootstrap(userId: string): Promise<Bootstrap>;
```

`leaveSpace()` locks the space and memberships, requires an explicit confirmed
request from the BFF, promotes the remaining partner to `owner` when necessary,
and removes only the caller's membership. If the caller is the last member, it
archives the empty space instead of deleting it. No shared records are deleted.

- [ ] **Step 6: Run tests and typecheck**

```powershell
npm --workspace @juntos/api test -- tokens identity-store session-service space-service
npm --workspace @juntos/api run typecheck
```

Expected: all tests pass with no database connection outside the in-memory test
adapter.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/security apps/api/src/identity apps/api/src/spaces
git commit -m "feat: persist private couple spaces"
```

---

### Task 4: Add the protected Render identity API and Google exchange

**Files:**

- Create: `apps/api/src/security/internal-request.ts`
- Create: `apps/api/src/security/internal-request.test.ts`
- Create: `apps/api/src/identity/google-identity.ts`
- Create: `apps/api/src/identity/google-identity.test.ts`
- Create: `apps/api/src/routes/internal-auth.ts`
- Create: `apps/api/src/routes/internal-auth.test.ts`
- Create: `apps/api/src/routes/internal-spaces.ts`
- Create: `apps/api/src/routes/internal-spaces.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/package.json`

**Interfaces:**

- Produces protected routes: `POST /internal/auth/google/exchange`, `GET /internal/bootstrap`, `POST /internal/auth/logout`, `POST /internal/spaces`, `POST /internal/spaces/leave`, `POST /internal/invitations`, and `POST /internal/invitations/accept`.
- Consumes `SessionService`, `SpaceService`, Google credentials, and the `x-juntos-proxy-key` plus `authorization` headers.

- [ ] **Step 1: Write the failing internal-boundary tests**

Assert missing, short, and incorrect proxy keys always produce the same `404`
response. Assert a correct key reaches the handler. Compare equal-length key
buffers through `timingSafeEqual`; length mismatch returns false before that
call.

- [ ] **Step 2: Write the failing Google adapter tests**

Inject the OAuth client boundary and assert the adapter:

- exchanges the code with the configured exact redirect URI and PKCE verifier;
- verifies ID-token signature, issuer, audience, expiry, and nonce;
- requires `email_verified === true`;
- normalizes the email;
- returns only `googleSubject`, `email`, `name`, and `avatarUrl`;
- discards Google access and refresh tokens after identity login.

- [ ] **Step 3: Write failing route tests**

Use Fastify injection, an in-memory database, and a fake Google adapter to test
the complete two-account flow. Also assert:

- invalid bodies return generic `400` responses without echoing input;
- absent or invalid sessions return `401`;
- a user from another space cannot read or mutate the first space;
- the sixth auth attempt within 15 minutes returns `429` in the rate-limit test;
- `Cache-Control: no-store` is present on every auth/private response;
- response JSON never contains Google tokens or token hashes.

- [ ] **Step 4: Add security plugins and request limits**

Register `@fastify/helmet` with a restrictive default policy and
`@fastify/rate-limit`. Set `bodyLimit` to 16 KiB. Keep the existing exact CORS
origin and hide framework-identifying headers.

- [ ] **Step 5: Implement the Google and internal routes**

Use a single generic public error shape:

```json
{ "error": "request_failed" }
```

Log only an event name, request id, status, and hashed correlation identifier.
Never attach request bodies or credential headers to logs. The backend returns
the raw session token only from the server-to-server exchange endpoint.

- [ ] **Step 6: Run the API security suite**

```powershell
npm --workspace @juntos/api test
npm --workspace @juntos/api run typecheck
```

Expected: all route, rate-limit, authorization, and header assertions pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src apps/api/package.json package.json package-lock.json
git commit -m "feat: add protected identity API"
```

---

### Task 5: Implement OAuth state, secure cookies, and the Next.js BFF

**Files:**

- Create: `apps/web/lib/server/auth-cookies.ts`
- Create: `apps/web/lib/server/auth-cookies.test.ts`
- Create: `apps/web/lib/server/oauth-state.ts`
- Create: `apps/web/lib/server/oauth-state.test.ts`
- Create: `apps/web/lib/server/same-origin.ts`
- Create: `apps/web/lib/server/same-origin.test.ts`
- Modify: `apps/web/lib/server/api-client-core.ts`
- Modify: `apps/web/lib/server/api-client.test.ts`
- Create: `apps/web/app/api/auth/google/start/route.ts`
- Create: `apps/web/app/api/auth/google/callback/route.ts`
- Create: `apps/web/app/api/auth/logout/route.ts`
- Create: `apps/web/app/api/bootstrap/route.ts`
- Create: `apps/web/app/api/spaces/route.ts`
- Create: `apps/web/app/api/spaces/leave/route.ts`
- Create: `apps/web/app/api/invitations/route.ts`
- Create: `apps/web/app/api/invitations/preserve/route.ts`
- Create: `apps/web/app/api/invitations/accept/route.ts`
- Create: `apps/web/app/api/auth/routes.test.ts`

**Interfaces:**

- Produces: `SESSION_COOKIE_NAME`, `createOAuthAttempt()`, `validateOAuthCallback()`, `assertSameOrigin()`, and the same-origin browser routes.
- Consumes: `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `API_BASE_URL`, and `INTERNAL_PROXY_KEY` only in server modules.

- [ ] **Step 1: Read the installed Next.js 16 request API docs**

Read the complete local files for route handlers, asynchronous `cookies()`,
redirects, and environment variables under `node_modules/next/dist/docs` before
writing route adapters. Use Next.js 16 async request APIs only.

- [ ] **Step 2: Write failing OAuth-state and cookie tests**

Assert `createOAuthAttempt()` returns distinct state, nonce, and PKCE verifier
values with at least 256 bits of randomness and the SHA-256 S256 challenge.
Assert callback validation uses constant-time state comparison and rejects
missing, expired, mismatched, or reused cookies.

Cookie tests require this production shape:

```ts
{
  name: "__Host-id",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}
```

Transient OAuth cookies use `HttpOnly`, `Secure`, `SameSite=Lax`, a callback
path, and ten-minute expiry. A pending invitation uses a separate ten-minute
`HttpOnly` host cookie. Development uses host-only cookie names and non-secure
cookies so `http://localhost` works.

- [ ] **Step 3: Write failing same-origin and backend-client tests**

State-changing routes accept only an exact `Origin` equal to the request origin
and `Sec-Fetch-Site` of `same-origin` or `none`. The backend client always adds
the internal proxy key server-side, forwards a session as a Bearer token when
provided, preserves `cache: "no-store"`, and never accepts an absolute path.

- [ ] **Step 4: Implement OAuth start and callback routes**

The start route stores the transient cookies and redirects to Google with:

```ts
{
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: GOOGLE_REDIRECT_URI,
  response_type: "code",
  scope: "openid email profile",
  state,
  nonce,
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
}
```

The callback rejects Google errors safely, consumes the transient cookies,
sends code/verifier/nonce to Render, sets the opaque session cookie, and uses a
303 redirect to `/`. Add `Cache-Control: no-store` to both routes.

- [ ] **Step 5: Implement private proxy routes**

All mutation routes call `assertSameOrigin()` before reading JSON. The
invitation-preservation route accepts a token captured from the URL fragment,
stores it briefly in an `HttpOnly` cookie, and never includes it in a redirect
URL. Invitation acceptance reads and clears that cookie, so the raw token does
not enter platform request logs. Other routes read the session cookie on the
server and never return it. Logout revokes the session, expires all auth cookies,
and returns `Clear-Site-Data: "cache", "cookies", "storage"`.

- [ ] **Step 6: Run web boundary tests**

```powershell
npm --workspace @juntos/web test -- auth-cookies oauth-state same-origin api-client routes
npm --workspace @juntos/web run typecheck
```

Expected: all tests pass, and no test needs real Google credentials.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/lib/server apps/web/app/api
git commit -m "feat: add secure authentication gateway"
```

---

### Task 6: Build the calm login, couple setup, invitation, and profile flows

**Files:**

- Create: `apps/web/lib/server/bootstrap.ts`
- Create: `apps/web/app/entrar/page.tsx`
- Create: `apps/web/app/comecar/page.tsx`
- Create: `apps/web/app/convite/page.tsx`
- Create: `apps/web/app/perfil/page.tsx`
- Create: `apps/web/components/auth/login-card.tsx`
- Create: `apps/web/components/auth/login-card.test.tsx`
- Create: `apps/web/components/onboarding/create-space-form.tsx`
- Create: `apps/web/components/onboarding/create-space-form.test.tsx`
- Create: `apps/web/components/onboarding/invitation-card.tsx`
- Create: `apps/web/components/onboarding/invitation-card.test.tsx`
- Create: `apps/web/components/onboarding/accept-invitation.tsx`
- Create: `apps/web/components/onboarding/accept-invitation.test.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/components/app-shell.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**

- Produces the user-visible `/entrar`, `/comecar`, `/convite`, and `/perfil` flows.
- Consumes: authenticated bootstrap data and same-origin BFF endpoints.

- [ ] **Step 1: Write failing login and route-gate tests**

Assert the login screen contains one clear “Continuar com Google” link to
`/api/auth/google/start`, explains that each person uses their own account, and
does not request Calendar permission. Test the page gate matrix:

| Session | Space | Result |
| --- | --- | --- |
| absent | — | redirect `/entrar` |
| valid | absent | redirect `/comecar` |
| valid | present | render chronological home |

- [ ] **Step 2: Write failing onboarding tests**

Assert create-space trims the name, exposes server validation beside the field,
disables duplicate submission, and redirects after success. Invitation tests
must cover generating, copying, regenerating, expiry text, optional email, and
the state where the second member has already joined.

Generated links use `/convite#token=<opaque-token>` so the bearer token is not
sent in the initial HTTP request or Referer. Acceptance tests must capture the
fragment, immediately remove it with `history.replaceState`, preserve it through
the same-origin route, keep it out of rendered text and logs, submit it once,
and use `router.replace("/")` after success.

- [ ] **Step 3: Implement protected server loading**

`getBootstrap()` reads the cookie through async `cookies()`, calls Render
server-to-server, validates `bootstrapSchema`, and returns a discriminated
result: `anonymous`, `needs-space`, or `ready`. It never calls the local Next.js
API route from a Server Component.

- [ ] **Step 4: Implement the screens in the established visual language**

Keep the warm off-white canvas, olive actions, clay detail, editorial heading,
comfortable 16px body text, and visible focus. Each screen contains one primary
task and at most one secondary action. Do not introduce dashboard panels,
gradient backgrounds, or extra navigation destinations.

The authenticated shell receives real user names and avatars. Its profile
control becomes a link to `/perfil`; the four primary navigation labels remain
exactly `Início`, `Agenda`, `Comidas`, and `Compras`.

- [ ] **Step 5: Implement accessible asynchronous states**

The profile page requires a typed confirmation before leaving the shared space.
After success it uses `router.replace("/comecar")`; the remaining member keeps
the space and becomes `owner` when needed.

Forms announce errors through `role="alert"`, success through a polite live
region, and loading through text plus disabled controls. Copy-link failure
reveals the selectable link as a fallback. No essential status depends on color.

- [ ] **Step 6: Run component and accessibility checks**

```powershell
npm --workspace @juntos/web test
npm --workspace @juntos/web run lint
npm --workspace @juntos/web run typecheck
```

Expected: all commands exit with code 0 and the original chronological-home
tests remain green.

- [ ] **Step 7: Commit**

```powershell
git add apps/web
git commit -m "feat: add private couple onboarding"
```

---

### Task 7: Verify the end-to-end two-person lifecycle and deployment contract

**Files:**

- Create: `apps/api/src/identity/two-person-flow.test.ts`
- Modify: `.env.example`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example`
- Modify: `README.md`
- Modify: `render.yaml`
- Modify: `tests/deployment-contract.test.mjs`

**Interfaces:**

- Consumes all identity and invitation interfaces from Tasks 1–6.
- Produces a deployable, documented identity phase with no source-tree secrets.

- [ ] **Step 1: Write the failing lifecycle test**

With Fastify injection, `pg-mem`, and two fake verified Google identities:

1. exchange Ana's code and obtain session A;
2. create “Ana e Bia” with session A;
3. generate a seven-day single-use invite;
4. exchange Bia's code and obtain session B;
5. accept with session B;
6. fetch bootstrap with both sessions and assert the same space id and member
   count 2;
7. retry the invite and assert failure;
8. authenticate a third user and assert the full space cannot be joined;
9. have Bia leave with explicit confirmation and assert Ana still has the same
   space with member count 1 while Bia has no space;
10. revoke session B and assert its next bootstrap returns `401`.

The test also queries `sessions` and `invitations` directly to prove the raw
tokens are absent.

- [ ] **Step 2: Complete environment and deployment contracts**

Document and validate these variables:

| Platform | Variable |
| --- | --- |
| Vercel | `API_BASE_URL`, `INTERNAL_PROXY_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` |
| Render | `DATABASE_URL`, `INTERNAL_PROXY_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN` |

`INTERNAL_PROXY_KEY` must hold the same secret in both platforms. Render marks
Google values and `WEB_ORIGIN` as `sync: false`; `DATABASE_URL` remains linked
to `juntos-db`.

- [ ] **Step 3: Run security-specific verification**

```powershell
npm --workspace @juntos/api test -- two-person-flow internal-request internal-auth internal-spaces
npm --workspace @juntos/web test -- auth-cookies oauth-state same-origin routes
```

Expected: the two-person lifecycle passes; invalid key, CSRF, expiry, reuse,
cross-space, and third-member checks are all covered by passing assertions.

- [ ] **Step 4: Run the complete repository gate**

```powershell
npm test
npm run typecheck
npm --workspace @juntos/web run lint
npm run build
git diff --check
git status --short
```

Expected: zero failed tests, zero TypeScript or lint errors, successful API and
Next.js production builds, and only intended identity-phase files modified.

- [ ] **Step 5: Verify runtime headers and private proxy behavior**

Run the migrated API and production Next.js build with local environment
values. Confirm:

- `/health` returns `200`;
- anonymous `/api/bootstrap` returns `401` with `Cache-Control: no-store`;
- direct `/internal/bootstrap` without the proxy key returns `404`;
- CSP, `X-Content-Type-Options`, frame protection, and referrer policy headers
  are present;
- `/sw.js` still excludes `/api/*` from caching.

- [ ] **Step 6: Perform the credentialed acceptance check**

After configuring one Google OAuth web client, register these exact callbacks:

```text
http://localhost:3000/api/auth/google/callback
https://<production-vercel-domain>/api/auth/google/callback
```

Use two Google accounts on different devices to create one space, share the
link, accept it once, reload both devices, and confirm both retain access to the
same space. Calendar permission must not appear during this check.

- [ ] **Step 7: Commit**

```powershell
git add .env.example apps/api/.env.example apps/web/.env.example apps/api/src/identity/two-person-flow.test.ts README.md render.yaml tests
git commit -m "test: verify two-person identity flow"
```

---

## Phase Completion Gate

- Every repository test, typecheck, lint check, and production build succeeds.
- Google state, nonce, PKCE, exact redirect URI, and verified email are enforced.
- Raw Google, session, invitation, and internal-proxy credentials are absent
  from the browser bundle, database, logs, and tracked files.
- Session fixation, expiry, revocation, invalid token, CSRF, rate limit,
  cross-space access, invite reuse, invite expiry, email mismatch, and a third
  member all have explicit passing tests.
- Two real Google accounts on separate devices can join the same space and
  recover it after reload.
- The authenticated home remains the approved single chronological timeline.
- The next Agenda phase can derive `userId` and `spaceId` exclusively from the
  authenticated backend session.
