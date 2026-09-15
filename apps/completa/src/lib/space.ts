import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import type { Bootstrap, CoupleSpace, SpaceMember } from "./types";

export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

type MemberRow = {
  space_id: string;
  space_name: string;
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
};

export type ProfileInput = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

function hashInvite(code: string): string {
  const normalized = code.trim().toUpperCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const bytes = new TextEncoder().encode(normalized);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i]!.toString(16).padStart(2, "0");
  return `${(hash >>> 0).toString(16).padStart(8, "0")}:${hex}`;
}

function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[bytes[i]! % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function memberFrom(row: MemberRow): SpaceMember {
  return {
    id: row.user_id,
    name: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
  };
}

async function loadSpace(sql: Sql, userId: string): Promise<CoupleSpace | null> {
  const mine = await sql<{ space_id: string }>`
    select space_id from space_members where user_id = ${userId} limit 1
  `;
  if (!mine[0]) return null;
  const spaceId = mine[0].space_id;
  const space = await sql<{ id: string; name: string }>`
    select id, name from couple_spaces where id = ${spaceId} limit 1
  `;
  if (!space[0]) return null;
  const members = await sql<MemberRow>`
    select m.space_id, s.name as space_name, m.user_id, m.display_name, m.email, m.avatar_url
    from space_members m
    join couple_spaces s on s.id = m.space_id
    where m.space_id = ${spaceId}
    order by m.joined_at
  `;
  const count = members.length === 2 ? 2 : 1;
  return {
    id: space[0].id,
    name: space[0].name,
    memberCount: count,
    members: members.map(memberFrom),
  };
}

async function upsertOwnProfile(sql: Sql, userId: string, profile: ProfileInput) {
  const name = profile.name.trim().slice(0, 80) || "Você";
  await sql`
    update space_members
    set display_name = ${name},
        email = ${profile.email},
        avatar_url = ${profile.avatarUrl}
    where user_id = ${userId}
  `;
}

export async function requireSpace(sql: Sql, userId: string): Promise<CoupleSpace> {
  const space = await loadSpace(sql, userId);
  if (!space) throw new AppError("NO_SPACE", "Crie ou aceite um convite para continuar.");
  return space;
}

export const getBootstrap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ProfileInput) => input)
  .handler(async ({ context, data }): Promise<Bootstrap> => {
    const sql = await getSql();
    await upsertOwnProfile(sql, context.userId, data);
    const space = await loadSpace(sql, context.userId);
    const self =
      space?.members.find((member) => member.id === context.userId) ?? {
        id: context.userId,
        name: data.name.trim().slice(0, 80) || "Você",
        email: data.email,
        avatarUrl: data.avatarUrl,
      };
    return { user: self, space };
  });

export const createSpace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { spaceName: string } & ProfileInput) => input)
  .handler(async ({ context, data }) => {
    const name = data.spaceName.trim();
    if (!name) throw new AppError("INVALID", "Dê um nome para o espaço de vocês.");
    if (name.length > 80) throw new AppError("INVALID", "Use até 80 caracteres.");
    const sql = await getSql();
    const existing = await loadSpace(sql, context.userId);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const person = data.name.trim().slice(0, 80) || "Você";
    await sql`
      insert into couple_spaces (id, name, created_by)
      values (${id}, ${name.slice(0, 80)}, ${context.userId})
    `;
    await sql`
      insert into space_members (space_id, user_id, display_name, email, avatar_url)
      values (${id}, ${context.userId}, ${person}, ${data.email}, ${data.avatarUrl})
    `;
    const space = await loadSpace(sql, context.userId);
    if (!space) throw new AppError("FAILED", "Não foi possível criar o espaço.");
    return space;
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { invitedEmail?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    if (space.memberCount === 2) {
      throw new AppError("FULL", "As duas pessoas já estão neste espaço.");
    }
    const invited = data.invitedEmail?.trim().toLowerCase() || null;
    if (invited && (invited.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invited))) {
      throw new AppError("INVALID", "Digite um e-mail válido.");
    }
    const code = makeInviteCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await sql`
      insert into invitations (id, space_id, code_hash, invited_email, expires_at, created_by)
      values (${crypto.randomUUID()}, ${space.id}, ${hashInvite(code)}, ${invited}, ${expiresAt}, ${context.userId})
    `;
    return { code, expiresAt };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string } & ProfileInput) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const already = await loadSpace(sql, context.userId);
    if (already) return already;
    const hash = hashInvite(data.code);
    const rows = await sql<{
      id: string;
      space_id: string;
      created_by: string;
      expires_at: string;
      used_at: string | null;
    }>`
      select id, space_id, created_by, expires_at::text as expires_at, used_at::text as used_at
      from invitations
      where code_hash = ${hash}
      limit 1
    `;
    const invite = rows[0];
    if (!invite || invite.used_at) {
      throw new AppError("INVALID_INVITE", "Este convite não está disponível.");
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new AppError("EXPIRED", "Este convite expirou. Peça um novo.");
    }
    if (invite.created_by === context.userId) {
      throw new AppError("OWN_INVITE", "Use outra conta para aceitar o convite.");
    }
    const members = await sql<{ n: number }>`
      select count(*)::int as n from space_members where space_id = ${invite.space_id}
    `;
    if ((members[0]?.n ?? 0) >= 2) {
      throw new AppError("FULL", "Este espaço já está completo.");
    }
    const name = data.name.trim().slice(0, 80) || "Você";
    await sql`
      insert into space_members (space_id, user_id, display_name, email, avatar_url)
      values (${invite.space_id}, ${context.userId}, ${name}, ${data.email}, ${data.avatarUrl})
    `;
    await sql`
      update invitations set used_at = now() where id = ${invite.id} and used_at is null
    `;
    const space = await loadSpace(sql, context.userId);
    if (!space) throw new AppError("FAILED", "Não foi possível entrar no espaço.");
    return space;
  });

export const leaveSpace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirmName: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const space = await requireSpace(sql, context.userId);
    if (data.confirmName.trim() !== space.name) {
      throw new AppError("CONFIRM", "Digite o nome do espaço para confirmar.");
    }
    await sql`delete from space_members where space_id = ${space.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });
