import { describe, expect, it, vi } from "vitest";

import { createBackendClient } from "./api-client-core";

describe("createBackendClient", () => {
  it("calls a backend-relative path without caching", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const backendFetch = createBackendClient({
      baseUrl: "https://juntos-api.onrender.com",
      fetcher,
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
    });

    await expect(backendFetch(path)).rejects.toThrow("backend-relative path");
  });
});
