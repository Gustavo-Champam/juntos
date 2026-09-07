// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createBackendClient } from "./api-client-core";

const proxyKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

describe("createBackendClient", () => {
  it("calls a backend-relative path without caching", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const backendFetch = createBackendClient({
      baseUrl: "https://juntos-api.onrender.com",
      fetcher,
      proxyKey,
      clientId: "a".repeat(64),
    });

    await backendFetch("/health");

    expect(fetcher).toHaveBeenCalledWith(
      "https://juntos-api.onrender.com/health",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it.each([
    "https://malicioso.example/health",
    "health",
    "//malicioso.example/health",
  ])("rejects unsafe path %s", async (path) => {
    const backendFetch = createBackendClient({
      baseUrl: "https://juntos-api.onrender.com",
      fetcher: vi.fn<typeof fetch>(),
      proxyKey,
      clientId: "a".repeat(64),
    });

    await expect(backendFetch(path)).rejects.toThrow("backend-relative path");
  });

  it("overwrites untrusted credentials, sends the server session and refuses redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const client = createBackendClient({ baseUrl: "https://api.example", fetcher, proxyKey, clientId: "a".repeat(64) });
    await client("/internal/bootstrap", { cache: "force-cache", headers: { "x-juntos-proxy-key": "forged", "x-juntos-client-id": "forged", authorization: "forged" } }, "s".repeat(43));
    const init = fetcher.mock.calls[0][1]!;
    expect(new Headers(init.headers).get("x-juntos-proxy-key")).toBe(proxyKey);
    expect(new Headers(init.headers).get("x-juntos-client-id")).toBe("a".repeat(64));
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${"s".repeat(43)}`);
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
  });

  it.each(["/\\evil.example", "/internal/../health", "/%2e%2e/health", "/health#fragment", "/health\n"]) ("rejects ambiguous paths %s", async (path) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createBackendClient({ baseUrl: "https://api.example", fetcher, proxyKey, clientId: "a".repeat(64) });
    await expect(client(path)).rejects.toThrow("backend-relative path");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["secret", "A".repeat(43), "A".repeat(42) + "B", "replace-with-one-shared-random-secret"]) (
    "rejects an invalid internal proxy key before making a request: %s",
    (invalidKey) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(() => createBackendClient({ baseUrl: "https://api.example", fetcher, proxyKey: invalidKey, clientId: "a".repeat(64) })).toThrow("Invalid internal proxy key");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
