import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInternalRequestGuard,
  constantTimeKeyEquals,
} from "./internal-request.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("constantTimeKeyEquals", () => {
  it("does not invoke the constant-time comparison for different-length keys", () => {
    const compare = vi.fn(() => true);

    expect(constantTimeKeyEquals("short", "a-longer-key", compare)).toBe(false);
    expect(compare).not.toHaveBeenCalled();
  });

  it("compares equal-length key buffers through the constant-time boundary", () => {
    const compare = vi.fn((left: Uint8Array, right: Uint8Array) =>
      Buffer.from(left).equals(Buffer.from(right)),
    );

    expect(constantTimeKeyEquals("correct-key", "correct-key", compare)).toBe(true);
    expect(compare).toHaveBeenCalledOnce();
    expect(compare.mock.calls[0]?.[0]).toEqual(Buffer.from("correct-key"));
    expect(compare.mock.calls[0]?.[1]).toEqual(Buffer.from("correct-key"));
  });
});

describe("buildInternalRequestGuard", () => {
  it.each([
    ["missing", undefined],
    ["short", "bad"],
    ["incorrect", "incorrect-ke"],
  ])("returns the same hidden response for a %s proxy key", async (_case, key) => {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.get(
      "/internal/test",
      { preHandler: buildInternalRequestGuard("correct-key") },
      async () => ({ reached: true }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/test",
      ...(key ? { headers: { "x-juntos-proxy-key": key } } : {}),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "request_failed" });
  });

  it("allows a request with the exact proxy key to reach the handler", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.get(
      "/internal/test",
      { preHandler: buildInternalRequestGuard("correct-key") },
      async () => ({ reached: true }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/test",
      headers: { "x-juntos-proxy-key": "correct-key" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reached: true });
  });
});
