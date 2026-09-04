import type { Bootstrap, CoupleSpace, PublicUser } from "@juntos/contracts";

export type StoredGoogleUser = {
  id: string;
  googleSubject: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export interface IdentityStore {
  upsertGoogleUser(user: StoredGoogleUser): Promise<PublicUser>;
  createSession(userId: string, tokenHash: Buffer, expiresAt: Date, createdAt: Date): Promise<void>;
  findActiveUserBySessionHash(tokenHash: Buffer, now: Date): Promise<PublicUser | null>;
  revokeSessionByTokenHash(tokenHash: Buffer, revokedAt: Date): Promise<void>;
  createSpace(userId: string, name: string, createdAt: Date): Promise<CoupleSpace>;
  createInvitation(userId: string, tokenHash: Buffer, invitedEmail: string | undefined, expiresAt: Date, createdAt: Date): Promise<void>;
  acceptInvitation(userId: string, tokenHash: Buffer, acceptedAt: Date): Promise<void>;
  leaveSpace(userId: string, leftAt: Date): Promise<void>;
  getBootstrap(userId: string): Promise<Bootstrap>;
}
