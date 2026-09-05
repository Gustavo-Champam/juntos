import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { LogoutButton } from "./logout-button";

describe("LogoutButton", () => {
  it("returns to sign-in after a successful private logout", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    render(<LogoutButton fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));

    expect(screen.getByRole("button", { name: /saindo/i })).toBeDisabled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/entrar"));
  });

  it("announces a logout failure without navigating", async () => {
    render(<LogoutButton fetcher={vi.fn(async () => new Response(null, { status: 502 }))} />);

    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível sair da conta. Tente novamente.");
  });
});
