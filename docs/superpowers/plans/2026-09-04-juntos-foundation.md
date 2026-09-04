# Juntos Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Use `test-driven-development` for every behavior change and `verification-before-completion` before claiming the phase is complete.

**Goal:** Deliver the first working slice of Juntos: a mobile-first monorepo with a Next.js frontend for Vercel, a Fastify API for Render, and the approved calm chronological home screen.

**Architecture:** Keep `apps/web` and `apps/api` in one npm workspace and place runtime contracts in `packages/contracts`. The browser talks only to same-origin Next.js route handlers. Those handlers call the Render API server-to-server. PostgreSQL will become the shared source of truth in the identity phase; this visual foundation uses deterministic representative data so the product direction can be validated before authentication and persistence are connected.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript, Next.js App Router, React, Tailwind CSS, Lucide icons, Fastify 5, Zod, Vitest, Testing Library, PostgreSQL-ready environment configuration, Vercel, Render.

**Spec:** `docs/superpowers/specs/2026-09-03-agenda-cardapio-casal-design.md`

## Global Constraints

- Frontend deploys to Vercel from `apps/web`; backend and PostgreSQL deploy to Render.
- Workspace installation happens from the repository root so both deploys can reach `packages/contracts`.
- The browser calls only same-origin `/api/*` routes; only the Next.js server calls the Render hostname.
- The initial private space supports exactly two members.
- The experience is mobile-first, responsive on desktop, and installable from the browser.
- The home screen is a single chronological timeline. Do not add summary dashboards, side panels, charts, or unrelated cards.
- Mobile navigation contains exactly `Início`, `Agenda`, `Comidas`, and `Compras`; account settings live under the avatar.
- Main body text is at least 16px, recurring control labels are at least 14px, keyboard focus is visible, and essential state never depends on color alone.
- PostgreSQL is the future source of truth. Browser storage is limited to device-local preferences and temporary offline drafts.
- Never commit Google credentials, database URLs, internal keys, or production secrets.

## Plan Boundaries

This phase establishes the deployable product foundation and approved visual language. Later implementation phases complete the product without replacing this base:

1. Google identity, protected sessions, the couple space, invitations, and PostgreSQL persistence.
2. Internal agenda, recurrence, a separate shared Google Calendar, and synchronization.
3. Weekly breakfast, lunch, and dinner planning, recipes, favorites, and quick suggestions.
4. Automatic shopping consolidation, manual items, cross-device updates, offline writes, and conflict handling.

All commands below run from the repository root unless a step explicitly says otherwise.

---

### Task 1: Create the workspace and shared runtime contracts

**Files:**

- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/health.test.ts`

- [ ] **Step 1: Define the root workspace**

Create a private npm workspace with these scripts:

```json
{
  "name": "juntos",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev:web": "npm --workspace @juntos/web run dev",
    "dev:api": "npm --workspace @juntos/api run dev",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

Ignore dependencies, build output, coverage, local environment files, Vercel state, visual-companion state, and logs. Keep every `.env.example` tracked.

- [ ] **Step 2: Document the local environment contract**

Add placeholders for:

```dotenv
API_BASE_URL=http://localhost:4000
INTERNAL_PROXY_KEY=replace-me
HOST=0.0.0.0
PORT=4000
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/juntos
```

- [ ] **Step 3: Write the failing shared-contract test**

The test must accept only this health payload:

```ts
{ status: "ok", service: "juntos-api" }
```

Run:

```powershell
npm install
npm --workspace @juntos/contracts test
```

Expected: the test fails because the schema is not implemented.

- [ ] **Step 4: Implement the smallest health contract**

Export `healthResponseSchema` and the inferred `HealthResponse` type from `packages/contracts/src/index.ts`. The package must compile declarations and JavaScript to `dist/`; consumers must run this shared build through their `pretest` and `prebuild` lifecycle scripts so clean cloud builds never depend on locally generated files.

- [ ] **Step 5: Verify and commit**

```powershell
npm --workspace @juntos/contracts test
npm --workspace @juntos/contracts run typecheck
npm --workspace @juntos/contracts run build
git add package.json package-lock.json .gitignore .env.example packages/contracts
git commit -m "build: create Juntos workspace"
```

---

### Task 2: Build the Render-ready Fastify API

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/routes/health.test.ts`

- [ ] **Step 1: Create the API package**

Use Fastify 5, `@fastify/cors`, Zod, dotenv, and `@juntos/contracts`. Add `dev`, `build`, `start`, `test`, and `typecheck` scripts. Add `pretest` and `prebuild` scripts that compile `@juntos/contracts` first. Production start must execute the compiled server.

- [ ] **Step 2: Write the failing route test**

Use Fastify injection to assert:

- `GET /health` returns `200`.
- The body satisfies `healthResponseSchema`.
- The body equals `{ status: "ok", service: "juntos-api" }`.

Run:

```powershell
npm install
npm --workspace @juntos/api test
```

Expected: the test fails because the application factory does not exist.

- [ ] **Step 3: Implement validated configuration**

Parse `HOST`, `PORT`, `NODE_ENV`, and `WEB_ORIGIN` through Zod. Fail during startup with a readable message when production configuration is invalid.

- [ ] **Step 4: Implement the application factory and health route**

Create `buildApp()` so tests do not bind a TCP port. Enable structured logs and allow CORS only from `WEB_ORIGIN`; do not use wildcard origins.

- [ ] **Step 5: Implement production startup**

Load configuration, listen on the configured host and port, and exit with a non-zero status after a startup failure.

- [ ] **Step 6: Verify and commit**

```powershell
npm --workspace @juntos/api test
npm --workspace @juntos/api run typecheck
npm --workspace @juntos/api run build
git add apps/api package.json package-lock.json
git commit -m "feat: add deployable API health service"
```

---

### Task 3: Scaffold the Next.js frontend and its same-origin API boundary

**Files:**

- Create: `apps/web/` with `create-next-app`
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/lib/server/api-client.ts`
- Create: `apps/web/lib/server/api-client.test.ts`
- Create: `apps/web/app/api/backend-health/route.ts`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Scaffold without creating a nested lockfile**

```powershell
npx create-next-app@latest apps/web --yes --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --skip-install
```

Rename the package to `@juntos/web`, declare the `@juntos/contracts` workspace dependency, add Vitest, Testing Library, and jsdom, then run only the root `npm install`. Add `pretest` and `prebuild` scripts that compile `@juntos/contracts` first.

- [ ] **Step 2: Configure component tests**

Create a jsdom Vitest configuration with the `@/` alias and Testing Library cleanup/setup.

- [ ] **Step 3: Write the failing server-client tests**

Assert that the client:

- turns `/health` into `${API_BASE_URL}/health`;
- requests uncached server data;
- rejects absolute URLs and paths that do not begin with exactly one slash.

- [ ] **Step 4: Implement the private server client**

Mark the module `server-only`, validate the relative path, read `API_BASE_URL` only on the server, and use `cache: "no-store"`. Do not expose `API_BASE_URL` through a `NEXT_PUBLIC_*` variable.

- [ ] **Step 5: Implement the same-origin health route**

`GET /api/backend-health` calls the backend, validates the body with `healthResponseSchema`, returns the valid payload, and returns a safe `503` response when the backend is unavailable or malformed.

- [ ] **Step 6: Set product metadata and verify**

Use `Juntos` as the product name and describe it as a shared agenda, meals, and shopping space for two people.

```powershell
npm --workspace @juntos/web test
npm --workspace @juntos/web run typecheck
npm --workspace @juntos/web run build
git add apps/web package.json package-lock.json
git commit -m "feat: add Vercel web application"
```

---

### Task 4: Implement the chronological timeline domain

**Files:**

- Create: `apps/web/features/timeline/types.ts`
- Create: `apps/web/features/timeline/build-timeline.ts`
- Create: `apps/web/features/timeline/build-timeline.test.ts`
- Create: `apps/web/features/timeline/demo-data.ts`

- [ ] **Step 1: Write the failing merge tests**

Cover these behaviors:

- agenda events and meals become one list;
- items are sorted by start time;
- items from another day are excluded;
- equal timestamps preserve a deterministic order;
- each item keeps its source type for presentation and accessibility.

- [ ] **Step 2: Define the minimum domain types**

Create `CalendarEvent`, `PlannedMeal`, and the discriminated `TimelineItem` union. Meals support `breakfast`, `lunch`, and `dinner`, plus a `quick` flag.

- [ ] **Step 3: Implement the pure timeline builder**

Do not import React, browser APIs, or framework code. Accept an ISO local date and return a new sorted array without mutating the inputs.

- [ ] **Step 4: Add representative product data**

Use a deterministic day containing:

- café da manhã;
- trabalho or a personal commitment;
- almoço;
- a quick dinner before night college;
- a night-college event.

- [ ] **Step 5: Verify and commit**

```powershell
npm --workspace @juntos/web test -- build-timeline
npm --workspace @juntos/web run typecheck
git add apps/web/features/timeline
git commit -m "feat: add chronological timeline domain"
```

---

### Task 5: Build the calm responsive product shell

**Files:**

- Create: `apps/web/components/app-shell.tsx`
- Create: `apps/web/components/app-shell.test.tsx`
- Create: `apps/web/components/timeline-view.tsx`
- Create: `apps/web/components/timeline-view.test.tsx`
- Create: `apps/web/lib/navigation.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Lock the navigation contract in tests**

Assert exact mobile destinations and labels: `Início`, `Agenda`, `Comidas`, `Compras`. Assert that profile/settings is a separate avatar control.

- [ ] **Step 2: Lock the visual-information contract in tests**

Render the representative timeline and assert:

- the selected date and day controls are present;
- `Faculdade` and the quick dinner appear in chronological order;
- meal type and quick-preparation state are announced in text;
- no element labeled `Resumo`, `Dashboard`, or `Visão geral` exists;
- the primary add action is reachable by an accessible name.

- [ ] **Step 3: Implement the responsive shell**

On phones, render a compact top bar and fixed bottom navigation. On desktop, move the same destinations into a narrow left rail and keep the timeline centered at a comfortable reading width. Do not duplicate navigation landmarks for screen readers.

- [ ] **Step 4: Implement the timeline view**

Render one uninterrupted list grouped only by time. Use small labels and icons to distinguish commitment, breakfast, lunch, and dinner. A `Rápida` label must be visible in addition to any color treatment. Include day navigation, empty state, and one primary add button.

- [ ] **Step 5: Establish the visual system**

Use a warm off-white canvas, near-black typography, subtle olive/sage accents, restrained borders, and one warm highlight for meals. Keep card radii moderate, shadows nearly absent, and animation limited to short state transitions. Respect `prefers-reduced-motion`.

Desktop inspiration may be editorial, but phone layouts must prioritize scan speed and thumb reach. Avoid gradients, glass effects, oversized hero text, decorative charts, and dense dashboard grids.

- [ ] **Step 6: Verify behavior and inspect both breakpoints**

```powershell
npm --workspace @juntos/web test
npm --workspace @juntos/web run typecheck
npm --workspace @juntos/web run build
npm run dev:web
```

Inspect at approximately 390×844 and 1440×900. Confirm there is no horizontal overflow, hidden content behind bottom navigation, clipped focus ring, or desktop-only control required on mobile.

- [ ] **Step 7: Commit**

```powershell
git add apps/web
git commit -m "feat: build calm chronological home"
```

---

### Task 6: Add installability and deployment contracts

**Files:**

- Create: `apps/web/app/manifest.ts`
- Create: `apps/web/public/sw.js`
- Create: `apps/web/components/service-worker-register.tsx`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/vercel.json`
- Create: `render.yaml`
- Create: `tests/deployment-contract.test.mjs`
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write the failing deployment-contract test**

Parse both deployment files and assert:

- Vercel identifies `apps/web` as the Next.js application;
- Render builds from the repository root;
- Render runs only the API workspace build and start scripts;
- Render checks `/health`;
- PostgreSQL is declared and supplies `DATABASE_URL`;
- secrets are referenced or generated, never written as literal production values.

- [ ] **Step 2: Add the Vercel contract**

Keep `apps/web/vercel.json` minimal with the Next.js framework declaration. In `README.md`, record the required project settings:

- Root Directory: `apps/web`;
- Include source files outside the Root Directory: enabled;
- workspace packages declared in the root `package.json`;
- `API_BASE_URL` and `INTERNAL_PROXY_KEY` configured only as Vercel environment variables.

This follows Vercel's monorepo model and keeps `packages/contracts` available during the build.

- [ ] **Step 3: Add the Render Blueprint**

Leave `rootDir` unset so npm can read the root lockfile and shared workspace package. Use scoped commands:

```yaml
services:
  - type: web
    name: juntos-api
    runtime: node
    buildCommand: npm ci && npm --workspace @juntos/api run build
    startCommand: npm --workspace @juntos/api run start
    healthCheckPath: /health
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: juntos-db
          property: connectionString
      - key: WEB_ORIGIN
        sync: false
      - key: INTERNAL_PROXY_KEY
        generateValue: true
    buildFilter:
      paths:
        - apps/api/**
        - packages/contracts/**
        - package.json
        - package-lock.json

databases:
  - name: juntos-db
    databaseName: juntos
    user: juntos
```

- [ ] **Step 4: Add installability**

Create a manifest with standalone display, theme colors from the visual system, and app icons. Register a conservative service worker that caches only the application shell and static assets in this phase. Never cache authenticated API responses.

- [ ] **Step 5: Document local and production setup**

Write short, copyable steps for Node 22, root installation, running both applications, environment variables, Vercel project settings, Render Blueprint deployment, and the later Google OAuth callback domains.

- [ ] **Step 6: Run complete verification**

```powershell
npm test
npm run typecheck
npm run build
git diff --check
git status --short
```

Start both applications, verify `GET /health`, verify `/api/backend-health`, and visually recheck the phone and desktop layouts.

- [ ] **Step 7: Commit the deployable foundation**

```powershell
git add apps/web render.yaml tests README.md package.json package-lock.json
git commit -m "chore: add Vercel and Render deployment contracts"
```

---

## Phase Completion Gate

The foundation is complete only when:

- every test, typecheck, and production build succeeds from the repository root;
- the API health endpoint works locally;
- the Next.js same-origin proxy returns the validated backend health payload;
- the mobile home shows only the chronological day flow and primary navigation;
- the desktop view uses the same information hierarchy without becoming a dashboard;
- the web app exposes an installable manifest and does not cache API data;
- deployment files match the documented Vercel and Render monorepo settings;
- no secret is present in tracked files.

After this gate, write the identity-and-invitation implementation plan against this foundation, including PostgreSQL migrations, opaque sessions, Google login, and the two-person membership rule.
