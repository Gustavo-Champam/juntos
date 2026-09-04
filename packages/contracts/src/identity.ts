import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(80);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const idSchema = z.string().min(1);
const urlSafeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).min(43).max(256);

export const publicUserSchema = z.object({
  id: idSchema,
  email: emailSchema,
  name: nameSchema,
  avatarUrl: z.string().nullable(),
}).strict();

export type PublicUser = z.infer<typeof publicUserSchema>;

export const coupleSpaceSchema = z.object({
  id: idSchema,
  name: nameSchema,
  memberCount: z.union([z.literal(1), z.literal(2)]),
}).strict();

export type CoupleSpace = z.infer<typeof coupleSpaceSchema>;

export const bootstrapSchema = z.object({
  user: publicUserSchema,
  space: coupleSpaceSchema.nullable(),
}).strict();

export type Bootstrap = z.infer<typeof bootstrapSchema>;

export const googleExchangeRequestSchema = z.object({
  code: z.string().min(1).max(2048),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]+$/).min(43).max(128),
  nonce: z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(256),
}).strict();

export type GoogleExchangeRequest = z.infer<typeof googleExchangeRequestSchema>;

export const googleExchangeResponseSchema = z.object({
  sessionToken: z.string().min(1),
  user: publicUserSchema,
  space: coupleSpaceSchema.nullable(),
}).strict();

export type GoogleExchangeResponse = z.infer<typeof googleExchangeResponseSchema>;

export const createSpaceRequestSchema = z.object({ name: nameSchema }).strict();
export type CreateSpaceRequest = z.infer<typeof createSpaceRequestSchema>;

export const createInvitationRequestSchema = z.object({
  invitedEmail: emailSchema.optional(),
}).strict();
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const createInvitationResponseSchema = z.object({
  token: urlSafeTokenSchema,
  expiresAt: z.iso.datetime(),
}).strict();
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export const acceptInvitationRequestSchema = z.object({ token: urlSafeTokenSchema }).strict();
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
