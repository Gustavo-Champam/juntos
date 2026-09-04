import { healthResponseSchema } from "@juntos/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /health", () => {
  it("returns the public health contract", async () => {
    const app = buildApp({ logger: false, webOrigin: "http://localhost:3000" });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(payload)).toEqual({
      status: "ok",
      service: "juntos-api",
    });
  });
});
