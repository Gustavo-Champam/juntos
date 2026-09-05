import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { AcceptInvitation } from "./accept-invitation";

describe("AcceptInvitation", () => {
  it("moves a fragment token into the same-origin private route before accepting it once", async () => {
    window.history.replaceState(null, "", "/convite#token=" + "a".repeat(43));
    const replaceState = vi.spyOn(window.history, "replaceState");
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    render(<AcceptInvitation fetcher={fetcher} />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/invitations/preserve", expect.objectContaining({ method: "POST" })));
    expect(replaceState).toHaveBeenCalledWith(null, "", "/convite");
    expect(document.body.textContent).not.toContain("a".repeat(43));
    fireEvent.click(screen.getByRole("button", { name: "Entrar no espaço" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/invitations/accept", expect.objectContaining({ method: "POST" })));
    expect(replace).toHaveBeenCalledWith("/");
  });
});
