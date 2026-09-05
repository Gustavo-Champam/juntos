import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { CreateSpaceForm } from "./create-space-form";

describe("CreateSpaceForm", () => {
  it("trims the space name, prevents duplicate sends, and continues after success", async () => {
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}")), 0)));
    render(<CreateSpaceForm fetcher={fetcher} />);

    fireEvent.change(screen.getByLabelText("Nome do espaço"), { target: { value: "  Casa da Ana e do Gui  " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar espaço" }));

    expect(fetcher).toHaveBeenCalledWith("/api/spaces", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Casa da Ana e do Gui" }),
    }));
    expect(screen.getByRole("button", { name: /criando/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /criando/i }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("maps a generic BFF failure to a friendly error alongside the name field", async () => {
    render(<CreateSpaceForm fetcher={vi.fn(async () => new Response(JSON.stringify({ error: "request_failed" }), { status: 400 }))} />);

    fireEvent.change(screen.getByLabelText("Nome do espaço"), { target: { value: "Nosso lugar" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar espaço" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível criar o espaço. Tente novamente.");
  });

  it("does not submit a space name beyond the contract limit", () => {
    const fetcher = vi.fn();
    render(<CreateSpaceForm fetcher={fetcher} />);

    fireEvent.change(screen.getByLabelText("Nome do espaço"), { target: { value: "a".repeat(81) } });
    fireEvent.click(screen.getByRole("button", { name: "Criar espaço" }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Use até 80 caracteres");
  });
});
