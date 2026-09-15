import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBootstrap, redirect, loadHomeDay } = vi.hoisted(() => ({
  getBootstrap: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
  loadHomeDay: vi.fn(),
}));
vi.mock("@/lib/server/bootstrap", () => ({ getBootstrap }));
vi.mock("@/lib/server/live-data", () => ({ loadHomeDay }));
vi.mock("next/navigation", () => ({ redirect }));

import Home from "./page";
import { demoDate, demoEvents, demoMeals } from "@/features/timeline/demo-data";

const user = { id: "u1", email: "ana@example.com", name: "Ana", avatarUrl: null };

describe("home route gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("redirects an anonymous visitor to sign in", async () => {
    getBootstrap.mockResolvedValue({ status: "anonymous" });
    await expect(Home()).rejects.toThrow("redirect:/entrar");
  });

  it("redirects a signed-in person with no shared space to setup", async () => {
    getBootstrap.mockResolvedValue({ status: "needs-space", bootstrap: { user, space: null } });
    await expect(Home()).rejects.toThrow("redirect:/comecar");
  });

  it("renders the chronological home only for a ready member", async () => {
    getBootstrap.mockResolvedValue({ status: "ready", bootstrap: { user, space: { id: "s1", name: "Nosso canto", memberCount: 1 } } });
    loadHomeDay.mockResolvedValue({ date: demoDate, events: demoEvents, meals: demoMeals });
    render(await Home());
    expect(screen.getByRole("list", { name: "Rotina do dia" })).toBeInTheDocument();
  });

  it("offers a calm retry without redirecting when private data is unavailable", async () => {
    getBootstrap.mockResolvedValue({ status: "unavailable" });
    render(await Home());
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Não foi possível carregar agora." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tentar novamente" })).toHaveAttribute("href", "/");
    expect(document.body).not.toHaveTextContent("private");
  });
});
