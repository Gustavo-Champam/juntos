import { describe, expect, it } from "vitest";

import { createPool } from "./pool.js";

describe("createPool", () => {
  it("verifies the PostgreSQL server certificate when TLS is enabled", async () => {
    const pool = createPool("postgres://juntos:juntos@db.example.com:5432/juntos", true);

    expect(pool.options.ssl).toBe(true);

    await pool.end();
  });
});
