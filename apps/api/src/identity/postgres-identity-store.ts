import { randomUUID } from "node:crypto";

import type { Bootstrap, CoupleSpace, PublicUser } from "@juntos/contracts";
import type { PoolClient } from "pg";

import type { Database } from "../db/pool.js";
import type { IdentityStore, StoredGoogleUser } from "./identity-store.js";

type StoreDependencies = { generateId?: () => string };

type UserRow = { id: string; email: string; name: string; avatar_url: string | null };
type InvitationRow = { id: string; space_id: string; invited_email: string | null; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null };
type SpaceRow = { id: string; name: string; archived_at: Date | null };

function publicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PostgresIdentityStore implements IdentityStore {
  private readonly generateId: () => string;

  constructor(private readonly database: Database, dependencies: StoreDependencies = {}) {
    this.generateId = dependencies.generateId ?? randomUUID;
  }

  async upsertGoogleUser(user: StoredGoogleUser): Promise<PublicUser> {
    const result = await this.database.query<UserRow>(
      `INSERT INTO users (id, google_subject, email, display_name, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_subject) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()
       RETURNING id, email, display_name AS name, avatar_url`,
      [user.id, user.googleSubject, normalizeEmail(user.email), user.name.trim(), user.avatarUrl],
    );
    const row = result.rows[0];
    if (!row) throw new Error("user upsert failed");
    return publicUser(row);
  }

  async createSession(userId: string, tokenHash: Buffer, expiresAt: Date, createdAt: Date): Promise<void> {
    await this.database.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [this.generateId(), userId, tokenHash, expiresAt, createdAt],
    );
  }

  async findActiveUserBySessionHash(tokenHash: Buffer, now: Date): Promise<PublicUser | null> {
    const result = await this.database.query<UserRow>(
      `SELECT u.id, u.email, u.display_name AS name, u.avatar_url
       FROM sessions AS s
       INNER JOIN users AS u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    return row ? publicUser(row) : null;
  }

  async revokeSessionByTokenHash(tokenHash: Buffer, revokedAt: Date): Promise<void> {
    await this.database.query(
      "UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL",
      [tokenHash, revokedAt],
    );
  }

  async createSpace(userId: string, name: string, createdAt: Date): Promise<CoupleSpace> {
    return this.inTransaction(async (client) => {
      const user = await client.query<{ id: string }>("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user.rows[0]) throw new Error("user not found");
      const membership = await client.query<{ space_id: string }>("SELECT space_id FROM memberships WHERE user_id = $1", [userId]);
      if (membership.rows[0]) throw new Error("user already belongs to a space");
      const id = this.generateId();
      await client.query(
        "INSERT INTO couple_spaces (id, name, created_by, created_at) VALUES ($1, $2, $3, $4)",
        [id, name.trim(), userId, createdAt],
      );
      await client.query(
        "INSERT INTO memberships (space_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)",
        [id, userId, "owner", createdAt],
      );
      return { id, name: name.trim(), memberCount: 1 };
    });
  }

  async createInvitation(userId: string, tokenHash: Buffer, invitedEmail: string | undefined, expiresAt: Date, createdAt: Date): Promise<void> {
    await this.inTransaction(async (client) => {
      const membership = await client.query<{ space_id: string }>("SELECT space_id FROM memberships WHERE user_id = $1", [userId]);
      const spaceId = membership.rows[0]?.space_id;
      if (!spaceId) throw new Error("user does not belong to a space");
      const space = await client.query<SpaceRow>(
        "SELECT id, name, archived_at FROM couple_spaces WHERE id = $1 AND archived_at IS NULL FOR UPDATE",
        [spaceId],
      );
      if (!space.rows[0]) throw new Error("space is unavailable");
      const activeMembership = await client.query<{ space_id: string }>(
        "SELECT space_id FROM memberships WHERE user_id = $1 AND space_id = $2 FOR UPDATE",
        [userId, spaceId],
      );
      if (!activeMembership.rows[0]) throw new Error("user does not belong to a space");
      await client.query(
        `UPDATE invitations SET revoked_at = $2
         WHERE space_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [spaceId, createdAt],
      );
      await client.query(
        `INSERT INTO invitations (id, space_id, created_by, invited_email, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [this.generateId(), spaceId, userId, invitedEmail === undefined ? null : normalizeEmail(invitedEmail), tokenHash, expiresAt, createdAt],
      );
    });
  }

  async acceptInvitation(userId: string, tokenHash: Buffer, acceptedAt: Date): Promise<void> {
    await this.inTransaction(async (client) => {
      const invitation = await client.query<InvitationRow>(
        `SELECT id, space_id, invited_email, expires_at, accepted_at, revoked_at
         FROM invitations
         WHERE token_hash = $1`,
        [tokenHash],
      );
      const invitationTarget = invitation.rows[0];
      if (!invitationTarget || invitationTarget.accepted_at || invitationTarget.revoked_at || invitationTarget.expires_at <= acceptedAt) {
        throw new Error("invitation is unavailable");
      }

      const existingMembership = await client.query<{ space_id: string }>(
        "SELECT space_id FROM memberships WHERE user_id = $1",
        [userId],
      );
      if (existingMembership.rows[0]) throw new Error("user already belongs to a space");

      const space = await client.query<SpaceRow>(
        "SELECT id, name, archived_at FROM couple_spaces WHERE id = $1 AND archived_at IS NULL FOR UPDATE",
        [invitationTarget.space_id],
      );
      if (!space.rows[0]) throw new Error("space is unavailable");

      const members = await client.query<{ user_id: string }>(
        "SELECT user_id FROM memberships WHERE space_id = $1 FOR UPDATE",
        [invitationTarget.space_id],
      );
      const recheckedMembership = await client.query<{ space_id: string }>(
        "SELECT space_id FROM memberships WHERE user_id = $1",
        [userId],
      );
      if (recheckedMembership.rows[0]) throw new Error("user already belongs to a space");

      const lockedInvitation = await client.query<InvitationRow>(
        `SELECT id, space_id, invited_email, expires_at, accepted_at, revoked_at
         FROM invitations
         WHERE token_hash = $1 AND space_id = $2
         FOR UPDATE`,
        [tokenHash, invitationTarget.space_id],
      );
      const invite = lockedInvitation.rows[0];
      if (!invite || invite.accepted_at || invite.revoked_at || invite.expires_at <= acceptedAt) throw new Error("invitation is unavailable");
      if (members.rows.length >= 2) throw new Error("space is full");

      const user = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
      const email = user.rows[0]?.email;
      if (!email) throw new Error("user not found");
      if (invite.invited_email && invite.invited_email !== email) throw new Error("invitation email does not match");
      try {
        await client.query(
          "INSERT INTO memberships (space_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)",
          [invite.space_id, userId, "partner", acceptedAt],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("user already belongs to a space");
        throw error;
      }
      await client.query(
        "UPDATE invitations SET accepted_by = $2, accepted_at = $3 WHERE id = $1",
        [invite.id, userId, acceptedAt],
      );
    });
  }

  async leaveSpace(userId: string, leftAt: Date): Promise<void> {
    await this.inTransaction(async (client) => {
      const membership = await client.query<{ space_id: string; role: "owner" | "partner" }>(
        "SELECT space_id, role FROM memberships WHERE user_id = $1",
        [userId],
      );
      const membershipTarget = membership.rows[0];
      if (!membershipTarget) throw new Error("user does not belong to a space");
      const space = await client.query<SpaceRow>(
        "SELECT id, name, archived_at FROM couple_spaces WHERE id = $1 AND archived_at IS NULL FOR UPDATE",
        [membershipTarget.space_id],
      );
      if (!space.rows[0]) throw new Error("space is unavailable");
      const activeMembership = await client.query<{ space_id: string; role: "owner" | "partner" }>(
        "SELECT space_id, role FROM memberships WHERE user_id = $1 AND space_id = $2 FOR UPDATE",
        [userId, membershipTarget.space_id],
      );
      const current = activeMembership.rows[0];
      if (!current) throw new Error("user does not belong to a space");
      const members = await client.query<{ user_id: string; role: "owner" | "partner" }>(
        "SELECT user_id, role FROM memberships WHERE space_id = $1 FOR UPDATE",
        [current.space_id],
      );
      const remaining = members.rows.filter((member) => member.user_id !== userId);
      await client.query("DELETE FROM memberships WHERE space_id = $1 AND user_id = $2", [current.space_id, userId]);
      if (remaining.length === 0) {
        await client.query("UPDATE couple_spaces SET archived_at = $2 WHERE id = $1", [current.space_id, leftAt]);
      } else if (current.role === "owner") {
        await client.query("UPDATE memberships SET role = $3 WHERE space_id = $1 AND user_id = $2", [current.space_id, remaining[0]?.user_id, "owner"]);
      }
    });
  }

  async getBootstrap(userId: string): Promise<Bootstrap> {
    const userResult = await this.database.query<UserRow>(
      "SELECT id, email, display_name AS name, avatar_url FROM users WHERE id = $1",
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("user not found");
    const membership = await this.database.query<{ space_id: string }>("SELECT space_id FROM memberships WHERE user_id = $1", [userId]);
    const spaceId = membership.rows[0]?.space_id;
    if (!spaceId) return { user: publicUser(user), space: null };
    const space = await this.database.query<SpaceRow>(
      "SELECT id, name, archived_at FROM couple_spaces WHERE id = $1",
      [spaceId],
    );
    const current = space.rows[0];
    if (!current || current.archived_at) return { user: publicUser(user), space: null };
    const count = await this.database.query<{ member_count: number }>("SELECT count(*)::int AS member_count FROM memberships WHERE space_id = $1", [spaceId]);
    return { user: publicUser(user), space: { id: current.id, name: current.name, memberCount: (count.rows[0]?.member_count ?? 0) as 1 | 2 } };
  }

  private async inTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
