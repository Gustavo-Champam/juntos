import { describe, expect, it } from "vitest";

import { createPool } from "./pool.js";

describe("createPool", () => {
  it("verifies the PostgreSQL server certificate when TLS is enabled", async () => {
    const pool = createPool("postgres://juntos:juntos@db.example.com:5432/juntos", true);

    expect(pool.options.ssl).toBe(true);

    await pool.end();
  });

  it.each([
    "sslmode=no-verify",
    "ssl=0",
    "sslcert=%2Ftmp%2Fclient.crt",
    "sslkey=%2Ftmp%2Fclient.key",
    "sslrootcert=%2Ftmp%2Froot.crt",
    "sslnegotiation=direct",
    "uselibpqcompat=true",
  ])("rejects connection-string TLS override %s with verified TLS", (tlsQuery) => {
    expect(() =>
      createPool(
        `postgres://juntos:juntos@db.example.com:5432/juntos?${tlsQuery}`,
        true,
      ),
    ).toThrow("DATABASE_URL must not specify TLS parameters when DATABASE_SSL=true");
  });

  it("preserves non-TLS connection-string query options with verified TLS", async () => {
    const databaseUrl =
      "postgres://juntos:juntos@db.example.com:5432/juntos?application_name=juntos-api";
    const pool = createPool(databaseUrl, true);

    expect(pool.options.connectionString).toBe(databaseUrl);
    expect(pool.options.ssl).toBe(true);

    await pool.end();
  });
});
