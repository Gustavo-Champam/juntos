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
      "Pedir",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/agenda",
      "/comidas",
      "/compras",
      "/pedir",
    ]);
  });

  it("keeps profile and settings separate from primary navigation", () => {
    render(
      <AppShell>
        <p>Conteúdo</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "Abrir perfil e configurações" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir perfil e configurações" })).toHaveAttribute("href", "/perfil");
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

  it("shows the Google avatar with a non-referring request and keeps the initial fallback", () => {
    const { rerender } = render(
      <AppShell user={{ id: "u1", email: "ana@example.com", name: "Ana", avatarUrl: "https://lh3.googleusercontent.com/avatar" }}>
        <p>Conteúdo</p>
      </AppShell>,
    );

    const avatar = screen.getByRole("img", { name: "Foto de Ana" });
    expect(avatar).toHaveAttribute("src", "https://lh3.googleusercontent.com/avatar");
    expect(avatar).toHaveAttribute("referrerpolicy", "no-referrer");

    rerender(<AppShell user={{ id: "u1", email: "ana@example.com", name: "Ana", avatarUrl: null }}><p>Conteúdo</p></AppShell>);
    expect(screen.queryByRole("img", { name: "Foto de Ana" })).not.toBeInTheDocument();
    expect(screen.getByText("A", { selector: ".profile-user-avatar" })).toBeInTheDocument();
  });
});
