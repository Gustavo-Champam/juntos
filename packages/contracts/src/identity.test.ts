import { describe, expect, it } from "vitest";
import {
  acceptInvitationRequestSchema,
  bootstrapSchema,
  coupleSpaceSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  createSpaceRequestSchema,
  googleExchangeRequestSchema,
  googleExchangeResponseSchema,
  publicUserSchema,
} from "./identity.js";

const id = "9ee4dcca-a009-4a90-b8dc-e44e2d912c5d";
const validToken = "a".repeat(43);

describe("identity contracts", () => {
  it("accepts the public user shape and normalizes email and name", () => {
    expect(publicUserSchema.parse({ id, email: "ANA@EXAMPLE.COM", name: " Ana ", avatarUrl: null })).toEqual({
      id,
      email: "ana@example.com",
      name: "Ana",
      avatarUrl: null,
    });
  });

  it("accepts a bootstrap with an optional couple space", () => {
    expect(bootstrapSchema.parse({ user: { id, email: "ana@example.com", name: "Ana", avatarUrl: null }, space: null })).toEqual(
      expect.objectContaining({ space: null }),
    );
    expect(coupleSpaceSchema.parse({ id, name: "Casa", memberCount: 2 }).memberCount).toBe(2);
  });

  it("trims names and rejects blank or overlong names", () => {
    expect(createSpaceRequestSchema.parse({ name: " Casa " })).toEqual({ name: "Casa" });
    expect(() => createSpaceRequestSchema.parse({ name: " " })).toThrow();
    expect(() => createSpaceRequestSchema.parse({ name: "x".repeat(81) })).toThrow();
  });

  it("validates the OAuth exchange request and response", () => {
    expect(() => googleExchangeRequestSchema.parse({ code: "code", codeVerifier: "too-short", nonce: "nonce" })).toThrow();
    expect(googleExchangeRequestSchema.parse({ code: "code", codeVerifier: "a".repeat(43), nonce: "nonce_value-1" })).toEqual({
      code: "code",
      codeVerifier: "a".repeat(43),
      nonce: "nonce_value-1",
    });
    expect(googleExchangeResponseSchema.parse({ sessionToken: "session", user: { id, email: "ana@example.com", name: "Ana", avatarUrl: null }, space: null })).toEqual(
      expect.objectContaining({ sessionToken: "session" }),
    );
  });

  it("validates invitation request and response tokens", () => {
    expect(createInvitationRequestSchema.parse({ invitedEmail: "PARTNER@EXAMPLE.COM" })).toEqual({ invitedEmail: "partner@example.com" });
    expect(createInvitationRequestSchema.parse({})).toEqual({});
    expect(createInvitationResponseSchema.parse({ token: validToken, expiresAt: "2026-09-11T00:00:00.000Z" })).toEqual({ token: validToken, expiresAt: "2026-09-11T00:00:00.000Z" });
    expect(() => acceptInvitationRequestSchema.parse({ token: "short" })).toThrow();
    expect(acceptInvitationRequestSchema.parse({ token: validToken })).toEqual({ token: validToken });
  });
});
