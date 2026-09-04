# Juntos Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mobile-first Juntos application shell and its calm chronological home screen as the first working, testable slice of the approved product.

**Architecture:** Scaffold a Vinext/React Site in `juntos-app/`, keep the timeline merge logic as a pure domain module, and compose responsive presentation components around it. This phase uses representative in-app data so the product direction can be reviewed before identity and persistence are connected; the D1 binding is created now so later plans can add durable shared records without replacing the project.

**Tech Stack:** TypeScript, React, Vinext, Vite, Tailwind CSS, shadcn/ui, Lucide icons, Cloudflare D1 binding, Vitest, Testing Library, Web App Manifest, service worker.

**Spec:** `docs/superpowers/specs/2026-09-03-agenda-cardapio-casal-design.md`

## Global Constraints

- The application is private and designed for exactly two members in its initial version.
- The experience is mobile-first, works on desktop, and can be installed from the browser.
- The home screen is a single chronological timeline; full tools live in their dedicated areas.
- Mobile navigation contains exactly Início, Agenda, Comidas, and Compras; account settings live under the avatar.
- Main body text is at least 16px, recurring control labels are at least 14px, and essential status information is never below 14px.
- Information must not depend on color alone, keyboard focus must be visible, and reduced-motion preferences must be respected.
- Shared product data will use D1 in later plans; browser storage is limited to device-local preferences and temporary drafts.
- Do not store Google credentials, tokens, or other secrets in source control.

## Plan Boundaries

This plan is the first independently testable slice. The remaining approved scope is intentionally split into later plans:

1. Google identity, sessions, couple space, and invitations.
2. Internal agenda and Google Calendar synchronization.
3. Weekly meals, recipe catalog, favorites, and quick suggestions.
4. Shopping consolidation, cross-device synchronization, offline writes, and conflict handling.

All `npm` commands below run inside `juntos-app/`. All `git` commands run from the repository root.

---

### Task 1: Scaffold the hosted application and lock its contract

**Files:**
- Create: `juntos-app/` using the Sites initializer
- Modify: `juntos-app/package.json`
- Modify: `juntos-app/app/layout.tsx`
- Create: `juntos-app/vitest.config.ts`
- Create: `juntos-app/tests/setup.ts`
- Create: `juntos-app/tests/project-contract.test.ts`
- Inspect: `juntos-app/.openai/hosting.json`
- Inspect: `juntos-app/vite.config.ts`
- Inspect: `juntos-app/worker/index.ts`

**Interfaces:**
- Consumes: the approved design specification and the Sites generator contract.
- Produces: a buildable project, `npm test`, the logical `DB` binding, and metadata for the Juntos product.

- [ ] **Step 1: Scaffold the project with the required interface and persistence add-ons**

Run from the repository root:

```powershell
npm create --yes @openai/sites@0.3.0 juntos-app -- --yes --add-ons shadcn,d1 --install
```

Expected: `juntos-app/package.json`, `juntos-app/app/page.tsx`, `juntos-app/app/layout.tsx`, `juntos-app/app/globals.css`, `juntos-app/worker/index.ts`, and `juntos-app/.openai/hosting.json` exist; the hosting file declares the logical D1 binding.

- [ ] **Step 2: Add the test runtime**

Run:

```powershell
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add these scripts to `juntos-app/package.json` without changing the generated build or development scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Configure the test environment**

Create `juntos-app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

Create `juntos-app/tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write the failing project contract test**

Create `juntos-app/tests/project-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Juntos project contract", () => {
  it("keeps the D1 binding and product metadata", () => {
    const hosting = JSON.parse(readFileSync(".openai/hosting.json", "utf8"));
    const layout = readFileSync("app/layout.tsx", "utf8");

    expect(hosting.d1).toBeTruthy();
    expect(layout).toContain("Juntos");
    expect(layout).toContain("Agenda e cardápio compartilhados");
  });
});
```

- [ ] **Step 5: Run the contract test and confirm the metadata assertion fails**

Run:

```powershell
npm test -- tests/project-contract.test.ts
```

Expected: FAIL because the generated layout does not contain the Juntos title and description.

- [ ] **Step 6: Replace the starter metadata**

Set the exported metadata in `juntos-app/app/layout.tsx` to:

```ts
export const metadata = {
  title: "Juntos",
  description: "Agenda e cardápio compartilhados para organizar a vida a dois.",
};
```

Keep the generated document structure and stylesheet import unchanged.

- [ ] **Step 7: Run the contract test and production build**

Run:

```powershell
npm test -- tests/project-contract.test.ts
npm run build
```

Expected: the contract test passes and the generated worker build completes.

- [ ] **Step 8: Commit the scaffold**

```powershell
git add juntos-app
git commit -m "chore: scaffold Juntos site"
```

---

### Task 2: Implement the chronological timeline domain

**Files:**
- Create: `juntos-app/features/timeline/types.ts`
- Create: `juntos-app/features/timeline/build-day-timeline.ts`
- Create: `juntos-app/features/timeline/build-day-timeline.test.ts`
- Create: `juntos-app/features/timeline/demo-data.ts`

**Interfaces:**
- Consumes: `CalendarEvent[]`, `PlannedMeal[]`, and an ISO date string.
- Produces: `buildDayTimeline(input: BuildDayTimelineInput): TimelineItem[]`, sorted by time and stable by source order for equal times.

- [ ] **Step 1: Define the failing timeline behavior**

Create `juntos-app/features/timeline/build-day-timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDayTimeline } from "./build-day-timeline";

describe("buildDayTimeline", () => {
  it("merges events and meals in chronological order", () => {
    const items = buildDayTimeline({
      date: "2026-09-03",
      events: [
        { id: "event-1", title: "Faculdade", date: "2026-09-03", time: "19:00", owner: "couple" },
      ],
      meals: [
        { id: "meal-1", title: "Almoço", recipeName: "Arroz, feijão e frango", date: "2026-09-03", time: "12:30", durationMinutes: 35 },
        { id: "meal-2", title: "Jantar", recipeName: "Wrap de frango", date: "2026-09-03", time: "21:30", durationMinutes: 20 },
      ],
    });

    expect(items.map((item) => item.id)).toEqual(["meal-1", "event-1", "meal-2"]);
    expect(items.map((item) => item.kind)).toEqual(["meal", "event", "meal"]);
  });

  it("excludes records from another day", () => {
    const items = buildDayTimeline({
      date: "2026-09-03",
      events: [{ id: "event-2", title: "Cinema", date: "2026-09-05", time: "20:00", owner: "couple" }],
      meals: [],
    });

    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm test -- features/timeline/build-day-timeline.test.ts
```

Expected: FAIL because the module and types do not exist.

- [ ] **Step 3: Define the timeline types**

Create `juntos-app/features/timeline/types.ts`:

```ts
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  owner: "self" | "partner" | "couple";
  location?: string;
};

export type PlannedMeal = {
  id: string;
  title: "Café da manhã" | "Almoço" | "Jantar";
  recipeName: string;
  date: string;
  time: string;
  durationMinutes: number;
};

export type TimelineItem =
  | ({ kind: "event" } & CalendarEvent)
  | ({ kind: "meal" } & PlannedMeal);

export type BuildDayTimelineInput = {
  date: string;
  events: CalendarEvent[];
  meals: PlannedMeal[];
};
```

- [ ] **Step 4: Implement the pure merge function**

Create `juntos-app/features/timeline/build-day-timeline.ts`:

```ts
import type { BuildDayTimelineInput, TimelineItem } from "./types";

export function buildDayTimeline({ date, events, meals }: BuildDayTimelineInput): TimelineItem[] {
  const eventItems: TimelineItem[] = events
    .filter((event) => event.date === date)
    .map((event) => ({ ...event, kind: "event" }));
  const mealItems: TimelineItem[] = meals
    .filter((meal) => meal.date === date)
    .map((meal) => ({ ...meal, kind: "meal" }));

  return [...eventItems, ...mealItems].sort((left, right) => left.time.localeCompare(right.time));
}
```

- [ ] **Step 5: Add representative data for the first preview**

Create `juntos-app/features/timeline/demo-data.ts`:

```ts
import type { CalendarEvent, PlannedMeal } from "./types";

export const demoEvents: CalendarEvent[] = [
  { id: "work", title: "Trabalho", date: "2026-09-03", time: "09:00", owner: "self" },
  { id: "college", title: "Faculdade", date: "2026-09-03", time: "19:00", owner: "couple" },
];

export const demoMeals: PlannedMeal[] = [
  { id: "lunch", title: "Almoço", recipeName: "Arroz, feijão e frango", date: "2026-09-03", time: "12:30", durationMinutes: 35 },
  { id: "dinner", title: "Jantar", recipeName: "Wrap de frango", date: "2026-09-03", time: "21:30", durationMinutes: 20 },
];
```

- [ ] **Step 6: Run the focused test**

Run:

```powershell
npm test -- features/timeline/build-day-timeline.test.ts
```

Expected: both tests pass.

- [ ] **Step 7: Commit the domain slice**

```powershell
git add juntos-app/features/timeline
git commit -m "feat: add chronological day timeline"
```

---

### Task 3: Build the responsive application shell

**Files:**
- Create: `juntos-app/components/juntos/app-shell.tsx`
- Create: `juntos-app/components/juntos/bottom-nav.tsx`
- Create: `juntos-app/components/juntos/sidebar-nav.tsx`
- Create: `juntos-app/components/juntos/navigation.ts`
- Create: `juntos-app/components/juntos/app-shell.test.tsx`
- Modify: `juntos-app/app/globals.css`

**Interfaces:**
- Consumes: `children: ReactNode`, `activeItem: NavigationId`, and `displayName: string`.
- Produces: `AppShell`, `BottomNav`, and `SidebarNav` with the same four navigation destinations and an account avatar.

- [ ] **Step 1: Write the failing navigation contract test**

Create `juntos-app/components/juntos/app-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("exposes the four product destinations and account access", () => {
    render(<AppShell activeItem="home" displayName="Gustavo"><p>Conteúdo</p></AppShell>);

    for (const label of ["Início", "Agenda", "Comidas", "Compras"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: "Abrir perfil de Gustavo" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm test -- components/juntos/app-shell.test.tsx
```

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Define the single navigation source**

Create `juntos-app/components/juntos/navigation.ts`:

```ts
import { CalendarDays, CookingPot, House, ShoppingBasket } from "lucide-react";

export const navigationItems = [
  { id: "home", label: "Início", href: "/", icon: House },
  { id: "calendar", label: "Agenda", href: "/agenda", icon: CalendarDays },
  { id: "meals", label: "Comidas", href: "/comidas", icon: CookingPot },
  { id: "shopping", label: "Compras", href: "/compras", icon: ShoppingBasket },
] as const;

export type NavigationId = (typeof navigationItems)[number]["id"];
```

- [ ] **Step 4: Implement mobile and desktop navigation**

Create `juntos-app/components/juntos/bottom-nav.tsx`:

```tsx
import { navigationItems, type NavigationId } from "./navigation";

export function BottomNav({ activeItem }: { activeItem: NavigationId }) {
  return (
    <nav className="juntos-bottom-nav" aria-label="Navegação principal">
      {navigationItems.map(({ id, label, href, icon: Icon }) => (
        <a key={id} href={href} aria-current={activeItem === id ? "page" : undefined}>
          <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
```

Create `juntos-app/components/juntos/sidebar-nav.tsx`:

```tsx
import { navigationItems, type NavigationId } from "./navigation";

export function SidebarNav({ activeItem }: { activeItem: NavigationId }) {
  return (
    <nav className="juntos-sidebar-nav" aria-label="Navegação principal">
      <a className="juntos-brand" href="/" aria-label="Juntos, página inicial">juntos.</a>
      <div className="juntos-sidebar-links">
        {navigationItems.map(({ id, label, href, icon: Icon }) => (
          <a key={id} href={href} aria-current={activeItem === id ? "page" : undefined}>
            <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: Implement the shell**

Create `juntos-app/components/juntos/app-shell.tsx`:

```tsx
import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import type { NavigationId } from "./navigation";

export function AppShell({ children, activeItem, displayName }: {
  children: ReactNode;
  activeItem: NavigationId;
  displayName: string;
}) {
  return (
    <div className="juntos-shell">
      <aside className="juntos-sidebar"><SidebarNav activeItem={activeItem} /></aside>
      <div className="juntos-stage">
        <header className="juntos-header">
          <a className="juntos-brand" href="/" aria-label="Juntos, página inicial">juntos.</a>
          <button className="juntos-avatar" aria-label={`Abrir perfil de ${displayName}`}>{displayName.slice(0, 1)}</button>
        </header>
        <main className="juntos-main">{children}</main>
        <BottomNav activeItem={activeItem} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Apply the approved visual thesis through shared tokens**

Replace the generated color and type tokens in `juntos-app/app/globals.css` with a high-contrast editorial system:

```css
:root {
  --juntos-bg: #f6f7f9;
  --juntos-surface: #ffffff;
  --juntos-ink: #111216;
  --juntos-muted: #686b73;
  --juntos-line: #e3e5e9;
  --juntos-accent: #ff5d52;
  --juntos-accent-soft: #ffe4e1;
  --juntos-radius: 1.25rem;
  --juntos-shadow: 0 1rem 3rem rgb(17 18 22 / 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --juntos-bg: #0c0d10;
    --juntos-surface: #15161a;
    --juntos-ink: #f5f4ef;
    --juntos-muted: #a7a8ae;
    --juntos-line: #2a2c31;
    --juntos-accent-soft: #4a211f;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Add responsive shell rules so `.juntos-sidebar` is hidden below `48rem`, `.juntos-bottom-nav` is hidden at and above `48rem`, and `.juntos-main` never exceeds `52rem`.

- [ ] **Step 7: Run the shell test**

Run:

```powershell
npm test -- components/juntos/app-shell.test.tsx
```

Expected: the navigation and profile assertions pass.

- [ ] **Step 8: Commit the shell**

```powershell
git add juntos-app/components/juntos juntos-app/app/globals.css
git commit -m "feat: add responsive Juntos shell"
```

---

### Task 4: Render the calm home timeline and hand off the first preview

**Files:**
- Create: `juntos-app/features/timeline/timeline-view.tsx`
- Create: `juntos-app/features/timeline/timeline-view.test.tsx`
- Create: `juntos-app/components/juntos/juntos-demo.tsx`
- Modify: `juntos-app/app/page.tsx`

**Interfaces:**
- Consumes: `TimelineItem[]`, an ISO date, and the responsive shell from Task 3.
- Produces: a recognizable home route with chronological entries, a date stepper, and one primary add action.

- [ ] **Step 1: Write the failing timeline presentation test**

Create `juntos-app/features/timeline/timeline-view.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineView } from "./timeline-view";

describe("TimelineView", () => {
  it("shows chronological details without dashboard summary panels", () => {
    render(<TimelineView date="2026-09-03" items={[
      { kind: "event", id: "college", title: "Faculdade", date: "2026-09-03", time: "19:00", owner: "couple" },
      { kind: "meal", id: "dinner", title: "Jantar", recipeName: "Wrap de frango", date: "2026-09-03", time: "21:30", durationMinutes: 20 },
    ]} />);

    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("Faculdade")).toBeInTheDocument();
    expect(screen.getByText("Wrap de frango")).toBeInTheDocument();
    expect(screen.queryByText(/resumo/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm test -- features/timeline/timeline-view.test.tsx
```

Expected: FAIL because `TimelineView` does not exist.

- [ ] **Step 3: Implement the timeline presentation**

Create `juntos-app/features/timeline/timeline-view.tsx`:

```tsx
import { CalendarDays, CookingPot, Plus } from "lucide-react";
import type { TimelineItem } from "./types";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function TimelineView({ date, items }: { date: string; items: TimelineItem[] }) {
  return (
    <section className="timeline-view" aria-labelledby="day-heading">
      <header className="day-header">
        <div>
          <p className="day-kicker">Nossa quinta</p>
          <h1 id="day-heading">{formatDate(date)}</h1>
        </div>
        <div className="day-actions" aria-label="Navegar entre os dias">
          <button type="button" aria-label="Dia anterior">←</button>
          <button type="button">Hoje</button>
          <button type="button" aria-label="Próximo dia">→</button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="timeline-empty" role="status">
          <p>Nada planejado para este dia.</p>
          <button type="button">Adicionar o primeiro item</button>
        </div>
      ) : (
        <ol className="timeline-list">
          {items.map((item) => {
            const isMeal = item.kind === "meal";
            const Icon = isMeal ? CookingPot : CalendarDays;
            const title = isMeal ? item.recipeName : item.title;
            const detail = isMeal
              ? `${item.title} · ${item.durationMinutes} min`
              : item.location ?? (item.owner === "couple" ? "Com os dois" : "Compromisso pessoal");

            return (
              <li className="timeline-row" key={`${item.kind}-${item.id}`}>
                <time dateTime={`${item.date}T${item.time}`}>{item.time}</time>
                <div className="timeline-content">
                  <span className="timeline-kind"><Icon aria-hidden="true" size={15} />{isMeal ? "Refeição" : "Compromisso"}</span>
                  <h2 className="timeline-title">{title}</h2>
                  <p>{detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <button className="timeline-add" type="button" aria-label="Adicionar compromisso ou refeição">
        <Plus aria-hidden="true" size={20} />
        <span>Adicionar</span>
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Compose the representative product slice**

Create `juntos-app/components/juntos/juntos-demo.tsx`:

```tsx
"use client";

import { AppShell } from "./app-shell";
import { buildDayTimeline } from "@/features/timeline/build-day-timeline";
import { demoEvents, demoMeals } from "@/features/timeline/demo-data";
import { TimelineView } from "@/features/timeline/timeline-view";

export function JuntosDemo() {
  const date = "2026-09-03";
  const items = buildDayTimeline({ date, events: demoEvents, meals: demoMeals });

  return (
    <AppShell activeItem="home" displayName="Gustavo">
      <TimelineView date={date} items={items} />
    </AppShell>
  );
}
```

Replace `juntos-app/app/page.tsx` with:

```tsx
import { JuntosDemo } from "@/components/juntos/juntos-demo";

export default function HomePage() {
  return <JuntosDemo />;
}
```

- [ ] **Step 5: Style the timeline for calm hierarchy**

In `juntos-app/app/globals.css`, add `.day-header`, `.timeline-list`, and `.timeline-row` rules that satisfy these fixed values:

```css
.day-header h1 { font-size: clamp(2.5rem, 9vw, 4.75rem); line-height: 0.98; letter-spacing: -0.055em; }
.timeline-list { margin-top: 2rem; border-top: 1px solid var(--juntos-line); }
.timeline-row { display: grid; grid-template-columns: 4.5rem 1fr; gap: 1rem; padding: 1.25rem 0; border-bottom: 1px solid var(--juntos-line); }
.timeline-title { font-size: 1.125rem; font-weight: 650; }
```

The primary add button is fixed above the mobile navigation, becomes inline in the date header on desktop, and has the accessible name `Adicionar compromisso ou refeição`.

- [ ] **Step 6: Run tests and compile the slice**

Run:

```powershell
npm test
npm run build
npm run dev
```

Expected: tests pass, the build succeeds, and the development server prints a Local URL.

- [ ] **Step 7: Open the first meaningful preview**

Make one request to the exact Local URL to force compilation. Require a non-error response, then open that Local URL in the Codex preview and retain the same preview tab for the rest of the implementation.

Expected: the user sees the Juntos header, the date, one chronological list, the add action, and responsive navigation—not a starter page or loading skeleton.

- [ ] **Step 8: Commit the reviewed slice**

```powershell
git add juntos-app/app juntos-app/components juntos-app/features
git commit -m "feat: present the Juntos day timeline"
```

---

### Task 5: Add installability and explicit application states

**Files:**
- Create: `juntos-app/app/manifest.ts`
- Create: `juntos-app/public/sw.js`
- Create: `juntos-app/components/juntos/service-worker-register.tsx`
- Create: `juntos-app/components/juntos/app-state.tsx`
- Create: `juntos-app/components/juntos/app-state.test.tsx`
- Modify: `juntos-app/app/layout.tsx`

**Interfaces:**
- Consumes: browser service-worker support and one of `loading | empty | offline | error`.
- Produces: installable metadata, cached application shell assets, and consistent user-facing state components.

- [ ] **Step 1: Write the failing state test**

Create `juntos-app/components/juntos/app-state.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppState } from "./app-state";

describe("AppState", () => {
  it("offers a recovery action for an error", () => {
    render(<AppState kind="error" onRetry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível atualizar agora");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("announces offline status without presenting it as a failure", () => {
    render(<AppState kind="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Você está sem internet");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm test -- components/juntos/app-state.test.tsx
```

Expected: FAIL because `AppState` does not exist.

- [ ] **Step 3: Implement the state component**

Create `juntos-app/components/juntos/app-state.tsx`:

```tsx
const messages = {
  loading: "Organizando o dia…",
  empty: "Nada planejado para este dia.",
  offline: "Você está sem internet. As últimas informações continuam disponíveis.",
  error: "Não foi possível atualizar agora.",
} as const;

type AppStateKind = keyof typeof messages;

export function AppState({ kind, onRetry }: { kind: AppStateKind; onRetry?: () => void }) {
  const isError = kind === "error";
  return (
    <section className={`app-state app-state-${kind}`} role={isError ? "alert" : "status"}>
      <p>{messages[kind]}</p>
      {isError && onRetry ? <button type="button" onClick={onRetry}>Tentar novamente</button> : null}
    </section>
  );
}
```

- [ ] **Step 4: Add installable metadata**

Create `juntos-app/app/manifest.ts`:

```ts
export default function manifest() {
  return {
    name: "Juntos",
    short_name: "Juntos",
    description: "Agenda e cardápio compartilhados para organizar a vida a dois.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#111216",
  };
}
```

- [ ] **Step 5: Add a bounded service worker**

Create `juntos-app/public/sw.js`:

```js
const CACHE = "juntos-shell-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
});
```

Create `juntos-app/components/juntos/service-worker-register.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register("/sw.js"); };
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
```

Import and render `<ServiceWorkerRegister />` once inside the `<body>` in `juntos-app/app/layout.tsx`.

- [ ] **Step 6: Run the state tests and production build**

Run:

```powershell
npm test -- components/juntos/app-state.test.tsx
npm run build
```

Expected: the state tests pass and the build includes the manifest and service worker assets.

- [ ] **Step 7: Commit the installable foundation**

```powershell
git add juntos-app
git commit -m "feat: make Juntos installable and resilient"
```

---

### Task 6: Validate the foundation and prepare the identity plan

**Files:**
- Modify: `juntos-app/README.md`
- Create: `juntos-app/tests/accessibility-contract.test.ts`

**Interfaces:**
- Consumes: the completed foundation and its retained preview.
- Produces: a clean build, documented local workflow, verified accessibility contracts, and a stable base for Google identity work.

- [ ] **Step 1: Write the accessibility contract test**

Create `juntos-app/tests/accessibility-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accessibility contract", () => {
  it("keeps visible focus and reduced motion behavior", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("labels the primary timeline and add action", () => {
    const view = readFileSync("features/timeline/timeline-view.tsx", "utf8");
    expect(view).toContain("aria-labelledby=\"day-heading\"");
    expect(view).toContain("Adicionar compromisso ou refeição");
  });
});
```

- [ ] **Step 2: Run the test and fix only concrete failures**

Run:

```powershell
npm test -- tests/accessibility-contract.test.ts
```

Expected: PASS. If the focus selector is absent, add this exact rule to `app/globals.css`:

```css
:focus-visible { outline: 3px solid var(--juntos-accent); outline-offset: 3px; }
```

- [ ] **Step 3: Document the local workflow**

Replace the starter body in `juntos-app/README.md` with these sections and commands:

```markdown
# Juntos

Agenda e cardápio compartilhados para organizar a vida a dois.

## Desenvolvimento

`npm run dev` inicia a visualização local.

`npm test` executa os testes automatizados.

`npm run build` produz a versão de publicação.

## Dados e identidade

O projeto já reserva o banco D1. Google login, convite do casal e dados compartilhados entram na próxima fase; nenhum segredo deve ser salvo no repositório.
```

- [ ] **Step 4: Run the full verification set**

Run:

```powershell
npm test
npm run build
git status --short
```

Expected: every test passes, the build succeeds, and only the intended plan-progress or source changes are present.

- [ ] **Step 5: Commit the verified foundation**

```powershell
git add juntos-app
git commit -m "docs: verify Juntos foundation"
```

- [ ] **Step 6: Start the next planning boundary**

Create the next implementation plan at `docs/superpowers/plans/2026-09-04-juntos-identity-and-invites.md`. Its fixed scope is Google-only sign-in, secure sessions, a maximum of two members, one-time expiring invitations, server-side authorization, and a credential-configuration gate before live OAuth validation.
