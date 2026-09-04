// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertSameOrigin } from "./same-origin";

describe("same-origin mutations", () => {
  it.each(["same-origin", "none"])("allows exact origin with %s", (site) => {
    expect(() => assertSameOrigin(new Request("https://juntos.example/api/spaces", { headers: { origin: "https://juntos.example", "sec-fetch-site": site } }))).not.toThrow();
  });
  it.each([
    [null, "same-origin"], ["null", "same-origin"], ["https://evil.example", "same-origin"],
    ["https://juntos.example/", "same-origin"], ["https://juntos.example:444", "same-origin"],
    ["https://juntos.example", "same-site"], ["https://juntos.example", "cross-site"], ["https://juntos.example", null],
  ])("rejects origin %s / fetch-site %s", (origin, site) => {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    if (site) headers.set("sec-fetch-site", site);
    expect(() => assertSameOrigin(new Request("https://juntos.example/api/spaces", { headers }))).toThrow();
  });
});
