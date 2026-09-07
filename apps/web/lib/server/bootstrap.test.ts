// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./api-client", () => ({ backendFetch: vi.fn() }));

import { cookies } from "next/headers";
import { backendFetch } from "./api-client";
import { getBootstrap } from "./bootstrap";

const session = "s".repeat(43);
const user = { id: "u1", email: "ana@example.com", name: "Ana", avatarUrl: null };

describe("getBootstrap", () => {
  beforeEach(() => {
    vi.mocked(cookies).mockResolvedValue({ get: (name: string) => name === "id" ? { value: session } : undefined } as Awaited<ReturnType<typeof cookies>>);
  });
  afterEach(() => vi.resetAllMocks());

  it("classifies a missing session as anonymous without calling the local BFF", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as Awaited<ReturnType<typeof cookies>>);
    await expect(getBootstrap()).resolves.toEqual({ status: "anonymous" });
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("classifies a valid signed-in user without a space", async () => {
    vi.mocked(backendFetch).mockResolvedValue(Response.json({ user, space: null }));
    await expect(getBootstrap()).resolves.toEqual({ status: "needs-space", bootstrap: { user, space: null } });
    expect(backendFetch).toHaveBeenCalledWith("/internal/bootstrap", { method: "GET" }, session);
  });

  it("validates backend data before a ready user can enter the product", async () => {
    vi.mocked(backendFetch).mockResolvedValue(Response.json({ user, space: { id: "space-1", name: "Nosso canto", memberCount: 1 } }));
    await expect(getBootstrap()).resolves.toMatchObject({ status: "ready", bootstrap: { space: { name: "Nosso canto" } } });
  });

  it("classifies only a backend 401 as anonymous", async () => {
    vi.mocked(backendFetch).mockResolvedValue(new Response(null, { status: 401 }));
    await expect(getBootstrap()).resolves.toEqual({ status: "anonymous" });
  });

  it.each([429, 500, 503])("keeps backend status %s as an unavailable state", async (status) => {
    vi.mocked(backendFetch).mockResolvedValue(new Response(null, { status }));
    await expect(getBootstrap()).resolves.toEqual({ status: "unavailable" });
  });

  it("keeps network failures as an unavailable state", async () => {
    vi.mocked(backendFetch).mockRejectedValue(new Error("private network detail"));
    await expect(getBootstrap()).resolves.toEqual({ status: "unavailable" });
  });

  it("keeps malformed backend data as an unavailable state", async () => {
    vi.mocked(backendFetch).mockResolvedValue(Response.json({ user: { name: "incomplete" } }));
    await expect(getBootstrap()).resolves.toEqual({ status: "unavailable" });
  });
});
