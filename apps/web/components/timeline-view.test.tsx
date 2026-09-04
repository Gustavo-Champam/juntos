import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { demoDate, demoEvents, demoMeals } from "@/features/timeline/demo-data";

import { TimelineView } from "./timeline-view";

describe("TimelineView", () => {
  it("shows commitments and meals as one calm chronological day", () => {
    render(
      <TimelineView
        initialDate={demoDate}
        events={demoEvents}
        meals={demoMeals}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sexta-feira, 4 de setembro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dia anterior" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próximo dia" }),
    ).toBeInTheDocument();

    const dinner = screen.getByText("Wrap de frango e salada");
    const college = screen.getByText("Faculdade");
    expect(
      dinner.compareDocumentPosition(college) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Jantar")).toBeInTheDocument();
    expect(screen.getAllByText("Rápida").length).toBeGreaterThan(0);
    expect(screen.queryByText(/resumo|dashboard|visão geral/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Adicionar à rotina" }),
    ).toBeInTheDocument();
  });

  it("navigates to a day without plans and explains the empty state", () => {
    render(
      <TimelineView
        initialDate={demoDate}
        events={demoEvents}
        meals={demoMeals}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Próximo dia" }));

    expect(
      screen.getByRole("heading", { name: "Sábado, 5 de setembro" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dia livre por enquanto")).toBeInTheDocument();
  });
});
