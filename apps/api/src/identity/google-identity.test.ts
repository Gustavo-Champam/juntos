import { describe, expect, it, vi } from "vitest";

import {
  GoogleIdentityAdapter,
  type GoogleIdTokenPayload,
  type GoogleOAuthClient,
} from "./google-identity.js";

const request = {
  code: "authorization-code",
  codeVerifier: "v".repeat(43),
  nonce: "expected-nonce",
};

const validPayload: GoogleIdTokenPayload = {
  iss: "https://accounts.google.com",
  aud: "client-id",
  exp: 1_788_499_800,
  sub: "google-subject",
  email: "  ANA@Example.COM ",
  email_verified: true,
  name: "Ana",
  picture: "https://images.example.com/ana.jpg",
  nonce: "expected-nonce",
};

function createClient(payload: GoogleIdTokenPayload = validPayload): GoogleOAuthClient {
  return {
    getToken: vi.fn(async () => ({
      tokens: {
        id_token: "signed-id-token",
        access_token: "google-access-token",
        refresh_token: "google-refresh-token",
      },
    })),
    verifyIdToken: vi.fn(async () => ({ getPayload: () => payload })),
  };
}

function createAdapter(client: GoogleOAuthClient) {
  return new GoogleIdentityAdapter(client, {
    clientId: "client-id",
    redirectUri: "https://app.example.com/auth/google/callback",
    now: () => new Date("2026-09-04T00:00:00.000Z"),
  });
}

describe("GoogleIdentityAdapter", () => {
  it("uses the exact redirect and PKCE verifier, verifies the ID token, and returns only public identity fields", async () => {
    const client = createClient();
    const adapter = createAdapter(client);

    const identity = await adapter.exchange(request);

    expect(client.getToken).toHaveBeenCalledWith({
      code: "authorization-code",
      codeVerifier: "v".repeat(43),
      redirect_uri: "https://app.example.com/auth/google/callback",
    });
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: "signed-id-token",
      audience: "client-id",
    });
    expect(identity).toEqual({
      googleSubject: "google-subject",
      email: "ana@example.com",
      name: "Ana",
      avatarUrl: "https://images.example.com/ana.jpg",
    });
    expect(JSON.stringify(identity)).not.toContain("google-access-token");
    expect(JSON.stringify(identity)).not.toContain("google-refresh-token");
    expect(JSON.stringify(identity)).not.toContain("signed-id-token");
  });

  it("rejects a token whose signature verification fails", async () => {
    const client = createClient();
    vi.mocked(client.verifyIdToken).mockRejectedValueOnce(new Error("bad signature"));

    await expect(createAdapter(client).exchange(request)).rejects.toThrow(
      "bad signature",
    );
  });

  it.each([
    ["issuer", { iss: "https://issuer.example.com" }],
    ["audience", { aud: "another-client" }],
    ["expiry", { exp: 1_788_393_599 }],
    ["nonce", { nonce: "another-nonce" }],
    ["verified email", { email_verified: false }],
  ])("rejects an ID token with an invalid %s", async (_claim, override) => {
    const client = createClient({ ...validPayload, ...override });

    await expect(createAdapter(client).exchange(request)).rejects.toThrow(
      "invalid Google identity",
    );
  });

  it("rejects an exchange without an ID token or required identity claims", async () => {
    const noIdToken = createClient();
    vi.mocked(noIdToken.getToken).mockResolvedValueOnce({
      tokens: { access_token: "google-access-token" },
    });
    const missingClaims = createClient({ ...validPayload, sub: "", name: "" });

    await expect(createAdapter(noIdToken).exchange(request)).rejects.toThrow(
      "invalid Google identity",
    );
    await expect(createAdapter(missingClaims).exchange(request)).rejects.toThrow(
      "invalid Google identity",
    );
  });
});
