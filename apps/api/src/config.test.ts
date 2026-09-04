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
      internalProxyKey: "test-internal-proxy-key",
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
        INTERNAL_PROXY_KEY: "internal-proxy-key",
      }),
    ).toMatchObject({
      nodeEnv: "development",
      databaseSsl: true,
      databaseUrl: "postgres://juntos:juntos@localhost:5432/juntos",
    });
  });
});
