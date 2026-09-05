import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginCard } from "./login-card";

describe("LoginCard", () => {
  it("offers one Google sign-in action without Calendar access", () => {
    render(<LoginCard />);

    expect(screen.getByRole("link", { name: "Continuar com Google" })).toHaveAttribute(
      "href",
      "/api/auth/google/start",
    );
    expect(screen.getByText(/cada pessoa entra com a própria conta/i)).toBeInTheDocument();
    expect(screen.queryByText(/calendar|calendário/i)).not.toBeInTheDocument();
  });
});
