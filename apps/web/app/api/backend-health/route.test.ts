import { describe, expect, it } from "vitest";

import { createBackendHealthHandler } from "./route-core";

describe("backend health handler", () => {
  it("returns a validated healthy backend response", async () => {
    const handler = createBackendHealthHandler(async () =>
      Response.json({ status: "ok", service: "juntos-api" }),
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "juntos-api",
    });
  });

  it("hides malformed backend responses behind a safe status", async () => {
    const handler = createBackendHealthHandler(async () =>
      Response.json({ status: "ok", secret: "should-not-leak" }),
    );

    const response = await handler();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
