import { describe, expect, it } from "vitest";

import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("provides safe local defaults", () => {
    expect(parseConfig({})).toEqual({
      host: "0.0.0.0",
      port: 4000,
      nodeEnv: "development",
      webOrigin: "http://localhost:3000",
    });
  });

  it("requires an explicit web origin in production", () => {
    expect(() => parseConfig({ NODE_ENV: "production" })).toThrow(
      "WEB_ORIGIN is required in production",
    );
  });
});
