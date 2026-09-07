import { describe, expect, it } from "vitest";

import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("provides safe test defaults only in the test environment", () => {
    expect(parseConfig({ NODE_ENV: "test" })).toEqual({
      host: "0.0.0.0",
      port: 4000,
      nodeEnv: "test",
      webOrigin: "http://localhost:3000",
      databaseUrl: "postgres://juntos:juntos@localhost:5432/juntos_test",
      databaseSsl: false,
      googleClientId: "test-google-client-id",
      googleClientSecret: "test-google-client-secret",
      googleRedirectUri: "http://localhost:4000/auth/google/callback",
      internalProxyKey: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    });
  });

  it("requires database and identity settings in production", () => {
    expect(() => parseConfig({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_REDIRECT_URI|INTERNAL_PROXY_KEY/,
    );
  });

  it("parses explicit database settings outside the test environment", () => {
    expect(
      parseConfig({
        DATABASE_URL: "postgres://juntos:juntos@localhost:5432/juntos",
        DATABASE_SSL: "true",
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:4000/auth/google/callback",
        INTERNAL_PROXY_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
      }),
    ).toMatchObject({
      nodeEnv: "development",
      databaseSsl: true,
      databaseUrl: "postgres://juntos:juntos@localhost:5432/juntos",
    });
  });

  it.each([
    "replace-with-one-shared-random-secret",
    "short",
    "A".repeat(43),
    "A".repeat(42),
    "A".repeat(42) + "B",
    "A".repeat(42) + "!",
  ])("rejects a weak or non-canonical internal proxy key: %s", (internalProxyKey) => {
    expect(() => parseConfig({ NODE_ENV: "test", INTERNAL_PROXY_KEY: internalProxyKey })).toThrow(/INTERNAL_PROXY_KEY/);
  });
});
