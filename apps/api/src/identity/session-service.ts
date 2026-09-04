import type { PublicUser } from "@juntos/contracts";

import { randomUUID } from "node:crypto";

import { generateOpaqueToken, hashOpaqueToken } from "../security/tokens.js";
import type { IdentityStore } from "./identity-store.js";

type SessionDependencies = {
  now?: () => Date;
  generateToken?: () => string;
  generateId?: () => string;
};

type GoogleIdentity = { googleSubject: string; email: string; name: string; avatarUrl: string | null };

const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

export class SessionService {
  private readonly now: () => Date;
  private readonly generateToken: () => string;
  private readonly generateId: () => string;

  constructor(private readonly store: IdentityStore, dependencies: SessionDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.generateToken = dependencies.generateToken ?? generateOpaqueToken;
    this.generateId = dependencies.generateId ?? randomUUID;
  }

  async createForGoogleIdentity(identity: GoogleIdentity): Promise<{ sessionToken: string; user: PublicUser }> {
    const user = await this.store.upsertGoogleUser({ id: this.generateId(), ...identity });
    const sessionToken = this.generateToken();
    if (!sessionTokenPattern.test(sessionToken)) throw new Error("invalid generated session token");
    const createdAt = this.now();
    await this.store.createSession(user.id, hashOpaqueToken(sessionToken), new Date(createdAt.getTime() + sessionLifetimeMs), createdAt);
    return { sessionToken, user };
  }

  async authenticate(token: string): Promise<PublicUser | null> {
    if (!sessionTokenPattern.test(token)) return null;
    return this.store.findActiveUserBySessionHash(hashOpaqueToken(token), this.now());
  }

  async revoke(token: string): Promise<void> {
    if (!sessionTokenPattern.test(token)) return;
    await this.store.revokeSessionByTokenHash(hashOpaqueToken(token), this.now());
  }
}
