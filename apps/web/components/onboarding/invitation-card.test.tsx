import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InvitationCard } from "./invitation-card";

describe("InvitationCard", () => {
  it("generates, copies and regenerates an optional email invitation", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: "a".repeat(43), expiresAt: "2026-09-05T14:00:00.000Z" })));
    const writeText = vi.fn(async () => undefined);
    render(<InvitationCard fetcher={fetcher} clipboard={{ writeText }} />);

    fireEvent.change(screen.getByLabelText("E-mail da pessoa (opcional)"), { target: { value: " par@exemplo.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar convite" }));
    await screen.findByRole("button", { name: "Copiar convite" });

    expect(fetcher).toHaveBeenCalledWith("/api/invitations", expect.objectContaining({ body: JSON.stringify({ invitedEmail: "par@exemplo.com" }) }));
    expect(screen.getByText(/expira em/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar convite" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo convite" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("explains when the shared space already has both members", () => {
    render(<InvitationCard memberCount={2} />);
    expect(screen.getByText(/as duas pessoas já estão juntas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar convite" })).not.toBeInTheDocument();
  });

  it("shows a selectable link when copying is unavailable", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: "a".repeat(43), expiresAt: "2026-09-05T14:00:00.000Z" })));
    render(<InvitationCard fetcher={fetcher} clipboard={{ writeText: vi.fn(async () => { throw new Error("blocked"); }) }} />);

    fireEvent.click(screen.getByRole("button", { name: "Gerar convite" }));
    await screen.findByRole("button", { name: "Copiar convite" });
    fireEvent.click(screen.getByRole("button", { name: "Copiar convite" }));

    expect(await screen.findByLabelText("Link do convite")).toBeInTheDocument();
  });
});
