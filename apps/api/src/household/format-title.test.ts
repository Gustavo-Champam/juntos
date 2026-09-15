import { describe, expect, it } from "vitest";

import { formatMealTitle } from "./format-title.js";

describe("formatMealTitle", () => {
  it("turns a rushed spoken plate into a readable name", () => {
    expect(formatMealTitle("Hoje arroz feijao tilapia grelhada e salada")).toBe(
      "Arroz, feijão, tilápia grelhada e salada",
    );
    expect(formatMealTitle("jantar vai ser arroz feijao e carne")).toBe("Arroz, feijão e carne");
    expect(formatMealTitle("jantar 20h arroz feijao e carne")).toBe("Arroz, feijão e carne");
  });
});
