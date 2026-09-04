import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { generateOpaqueToken, hashOpaqueToken } from "./tokens.js";

describe("opaque tokens", () => {
  it("generates distinct 256-bit base64url tokens", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(Buffer.from(second, "base64url")).toHaveLength(32);
  });

  it("hashes tokens deterministically without retaining their raw representation", () => {
    const token = "a".repeat(43);
    const hash = hashOpaqueToken(token);

    expect(hash).toHaveLength(32);
    expect(hash.equals(hashOpaqueToken(token))).toBe(true);
    expect(hash.toString("utf8")).not.toBe(token);
    expect(hash.toString("base64url")).not.toBe(token);
  });
});
