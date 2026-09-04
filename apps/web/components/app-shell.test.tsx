import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("offers one clear primary navigation for the four product areas", () => {
    render(
      <AppShell>
        <p>Conteúdo</p>
      </AppShell>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Navegação principal",
    });
    const links = within(navigation).getAllByRole("link");

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Início",
      "Agenda",
      "Comidas",
      "Compras",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/agenda",
      "/comidas",
      "/compras",
    ]);
  });

  it("keeps profile and settings separate from primary navigation", () => {
    render(
      <AppShell>
        <p>Conteúdo</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("button", { name: "Abrir perfil e configurações" }),
    ).toBeInTheDocument();
  });

  it("marks the current product area in the primary navigation", () => {
    render(
      <AppShell currentPath="/comidas">
        <p>Conteúdo</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Comidas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
