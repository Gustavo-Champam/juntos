import { fireEvent, render, screen, within } from "@testing-library/react";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBootstrap, redirect } = vi.hoisted(() => ({
  getBootstrap: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
}));
vi.mock("@/lib/server/bootstrap", () => ({ getBootstrap }));
vi.mock("next/navigation", () => ({ redirect }));

const user = { id: "u1", email: "ana@example.com", name: "Ana", avatarUrl: null };
const space = { id: "s1", name: "Nosso canto", memberCount: 2 };

function pageUrl(relativePath: string) {
  return pathToFileURL(path.resolve(process.cwd(), relativePath)).href;
}

describe("product pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getBootstrap.mockResolvedValue({ status: "ready", bootstrap: { user, space } });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { op?: string };
      if (body.op === "agenda.list") {
        return Response.json({ changed: true, snapshot: { occurrences: [], members: [] } });
      }
      if (body.op === "prefs.get") {
        return Response.json({ breakfast: "07:15", lunch: "12:30", dinner: "19:00" });
      }
      return Response.json([]);
    }));
  });

  it("shows the live agenda editor instead of the old demo week", async () => {
    const { default: AgendaPage } = await import(
      /* @vite-ignore */ pageUrl("app/agenda/page.tsx")
    );

    render(await AgendaPage());

    expect(screen.getByRole("heading", { name: "Agenda da semana" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Compromissos da semana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    expect(screen.queryByText("Começar o trabalho")).not.toBeInTheDocument();
  });

  it("opens the full recipe catalog when choosing a meal", async () => {
    const { default: MealsPage } = await import(
      /* @vite-ignore */ pageUrl("app/comidas/page.tsx")
    );

    render(await MealsPage());
    const days = within(screen.getByRole("list", { name: "Refeições da semana" })).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    fireEvent.click(screen.getAllByRole("button", { name: /Escolher café/i })[0]!);

    expect(screen.getByRole("form", { name: "Horários das refeições" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Escolher refeição" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Catálogo de receitas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iogurte, fruta e granola/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Ou escrever na mão")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pedir sugestão da IA neste horário/i })).toBeInTheDocument();
  });

  it("offers a spoken assistant to write agenda and meals", async () => {
    const { default: AssistantPage } = await import(
      /* @vite-ignore */ pageUrl("app/pedir/page.tsx")
    );

    render(await AssistantPage());
    expect(screen.getByRole("heading", { name: "Pedir à IA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer isso" })).toBeInTheDocument();
    expect(screen.getByLabelText("O que vocês querem organizar?")).toBeInTheDocument();
  });

  it("shows the live shopping list with AI suggestions", async () => {
    const { default: ShoppingPage } = await import(
      /* @vite-ignore */ pageUrl("app/compras/page.tsx")
    );

    render(await ShoppingPage());

    expect(screen.getByRole("heading", { name: "Lista de compras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sugerir com IA/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });

  it("protects each product page with the authenticated shared-space bootstrap", async () => {
    getBootstrap.mockResolvedValue({ status: "anonymous" });
    const pages = [
      (await import(/* @vite-ignore */ pageUrl("app/agenda/page.tsx"))).default,
      (await import(/* @vite-ignore */ pageUrl("app/comidas/page.tsx"))).default,
      (await import(/* @vite-ignore */ pageUrl("app/compras/page.tsx"))).default,
      (await import(/* @vite-ignore */ pageUrl("app/pedir/page.tsx"))).default,
    ];

    for (const Page of pages) {
      await expect(Page()).rejects.toThrow("redirect:/entrar");
    }
  });

  it("renders an accessible retry on a product page when private data is unavailable", async () => {
    getBootstrap.mockResolvedValue({ status: "unavailable" });
    const { default: AgendaPage } = await import(/* @vite-ignore */ pageUrl("app/agenda/page.tsx"));
    render(await AgendaPage());
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Não foi possível carregar agora." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tentar novamente" })).toHaveAttribute("href", "/agenda");
  });
});
