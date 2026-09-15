import { describe, expect, it } from "vitest";

import { extractSpokenTime, parseAssistantCommand, resolveSpokenDate } from "./assistant.js";

describe("assistant parser", () => {
  it("turns a spoken routine into agenda + dinner", () => {
    const actions = parseAssistantCommand(
      "coloque na agenda que tenho consulta amanha 17 hrs e que a janta vai ser arroz feijao e carne",
      "2026-09-15",
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agenda",
          title: "Consulta",
          date: "2026-09-16",
          time: "17:00",
        }),
        expect.objectContaining({
          type: "meal",
          mealType: "dinner",
          date: "2026-09-16",
          title: "Arroz, feijão e carne",
        }),
      ]),
    );
    expect(actions.find((action) => action.type === "meal")).not.toHaveProperty("time");
  });

  it("formats a spoken plate and assumes lunch when no meal is named", () => {
    const actions = parseAssistantCommand(
      "Hoje arroz feijao tilapia grelhada e salada",
      "2026-09-15",
    );
    expect(actions).toEqual([
      expect.objectContaining({
        type: "meal",
        mealType: "lunch",
        date: "2026-09-15",
        title: "Arroz, feijão, tilápia grelhada e salada",
      }),
    ]);
  });

  it("keeps a time said next to the meal", () => {
    const actions = parseAssistantCommand("jantar 20h arroz feijao e carne", "2026-09-15");
    expect(actions).toEqual([
      expect.objectContaining({
        type: "meal",
        mealType: "dinner",
        time: "20:00",
        title: "Arroz, feijão e carne",
      }),
    ]);
  });

  it("resolves hoje and weekday names", () => {
    expect(resolveSpokenDate("hoje às 10", "2026-09-15")).toBe("2026-09-15");
    expect(extractSpokenTime("às 9h30")).toBe("09:30");
    expect(extractSpokenTime("2 ovos")).toBeNull();
  });

  it("matches strogonoff and a night class in one phrase", () => {
    const actions = parseAssistantCommand(
      "Almoço de hoje é strogonoff e à noite tem faculdade às 19h",
      "2026-09-15",
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "meal",
          mealType: "lunch",
          title: "Strogonoff de frango",
          recipeId: "strogonoff-frango",
        }),
        expect.objectContaining({
          type: "agenda",
          title: "Faculdade",
          time: "19:00",
        }),
      ]),
    );
  });

  it("splits several grocery items onto the list", () => {
    const actions = parseAssistantCommand("coloca banana e leite na lista", "2026-09-15");
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "shopping", name: "banana", category: "hortifruti" }),
        expect.objectContaining({ type: "shopping", name: "leite", category: "laticinios" }),
      ]),
    );
  });
});
