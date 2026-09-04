import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./index.js";

describe("healthResponseSchema", () => {
  it("accepts the public API health response", () => {
    expect(
      healthResponseSchema.parse({ status: "ok", service: "juntos-api" }),
    ).toEqual({ status: "ok", service: "juntos-api" });
  });

  it("rejects additional or changed fields", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "healthy",
        service: "juntos-api",
        secret: "should-not-leak",
      }).success,
    ).toBe(false);
  });
});
