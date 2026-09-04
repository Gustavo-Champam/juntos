import type { Bootstrap } from "@juntos/contracts";

import { generateOpaqueToken, hashOpaqueToken } from "../security/tokens.js";
import type { IdentityStore } from "../identity/identity-store.js";

type SpaceDependencies = { now?: () => Date; generateToken?: () => string };
const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export class SpaceService {
  private readonly now: () => Date;
  private readonly generateToken: () => string;

  constructor(private readonly store: IdentityStore, dependencies: SpaceDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.generateToken = dependencies.generateToken ?? generateOpaqueToken;
  }

  async createSpace(userId: string, name: string): Promise<Bootstrap> {
    await this.store.createSpace(userId, name, this.now());
    return this.store.getBootstrap(userId);
  }

  async createInvitation(userId: string, invitedEmail?: string): Promise<{ token: string; expiresAt: string }> {
    const token = this.generateToken();
    if (!opaqueTokenPattern.test(token)) throw new Error("invalid generated invitation token");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + invitationLifetimeMs);
    await this.store.createInvitation(userId, hashOpaqueToken(token), invitedEmail, expiresAt, createdAt);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async acceptInvitation(userId: string, token: string): Promise<Bootstrap> {
    if (!opaqueTokenPattern.test(token)) throw new Error("invalid invitation token");
    await this.store.acceptInvitation(userId, hashOpaqueToken(token), this.now());
    return this.store.getBootstrap(userId);
  }

  async leaveSpace(userId: string): Promise<Bootstrap> {
    await this.store.leaveSpace(userId, this.now());
    return this.store.getBootstrap(userId);
  }

  async getBootstrap(userId: string): Promise<Bootstrap> {
    return this.store.getBootstrap(userId);
  }
}
