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
  });

  it("shows commitments in chronological order on the agenda", async () => {
    const { default: AgendaPage } = await import(
      /* @vite-ignore */ pageUrl("app/agenda/page.tsx")
    );

    render(await AgendaPage());

    expect(
      screen.getByRole("heading", { name: "Agenda da semana" }),
    ).toBeInTheDocument();
    const commitments = within(
      screen.getByRole("list", { name: "Compromissos da semana" }),
    ).getAllByRole("listitem");

    expect(commitments.map((item) => item.textContent)).toEqual([
      expect.stringContaining("08:30Começar o trabalho"),
      expect.stringContaining("19:00Faculdade"),
      expect.stringContaining("10:00Mercado da semana"),
      expect.stringContaining("17:30Caminhada juntos"),
    ]);
  });

  it("shows three meals per day and highlights quick options", async () => {
    const { default: MealsPage } = await import(
      /* @vite-ignore */ pageUrl("app/comidas/page.tsx")
    );

    render(await MealsPage());

    expect(
      screen.getByRole("heading", { name: "Cardápio da semana" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 refeições por dia")).toBeInTheDocument();
    expect(screen.getAllByText("Rápida").length).toBeGreaterThan(0);

    const days = within(
      screen.getByRole("list", { name: "Refeições da semana" }),
    ).getAllByRole("listitem");

    expect(days).toHaveLength(7);
    days.forEach((day) => {
      expect(
        within(day).getAllByText(/^(Café|Almoço|Jantar)$/),
      ).toHaveLength(3);
    });
  });

  it("shows a usable shared shopping checklist", async () => {
    const { default: ShoppingPage } = await import(
      /* @vite-ignore */ pageUrl("app/compras/page.tsx")
    );

    render(await ShoppingPage());

    expect(
      screen.getByRole("heading", { name: "Lista de compras" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Itens para esta semana" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(8);

    const banana = screen.getByRole("checkbox", { name: /Banana/ });
    expect(banana).not.toBeChecked();
    expect(screen.getByText("2 de 8 comprados")).toBeInTheDocument();

    fireEvent.click(banana);

    expect(banana).toBeChecked();
    expect(screen.getByText("3 de 8 comprados")).toBeInTheDocument();
  });

  it("protects each product page with the authenticated shared-space bootstrap", async () => {
    getBootstrap.mockResolvedValue({ status: "anonymous" });
    const pages = [
      (await import(/* @vite-ignore */ pageUrl("app/agenda/page.tsx"))).default,
      (await import(/* @vite-ignore */ pageUrl("app/comidas/page.tsx"))).default,
      (await import(/* @vite-ignore */ pageUrl("app/compras/page.tsx"))).default,
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
