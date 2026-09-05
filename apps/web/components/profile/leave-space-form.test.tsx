import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { LeaveSpaceForm } from "./leave-space-form";

describe("LeaveSpaceForm", () => {
  it("requires the exact space name before leaving and then replaces setup history", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    render(<LeaveSpaceForm spaceName="Nosso canto" fetcher={fetcher} />);

    expect(screen.getByRole("button", { name: "Sair deste espaço" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/digite nosso canto/i), { target: { value: "Nosso canto" } });
    fireEvent.click(screen.getByRole("button", { name: "Sair deste espaço" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/spaces/leave", { method: "POST" }));
    expect(replace).toHaveBeenCalledWith("/comecar");
  });
});
