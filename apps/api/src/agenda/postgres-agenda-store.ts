import { randomUUID } from "node:crypto";

import type {
  AgendaEvent,
  CreateAgendaRequest,
  DeleteAgendaRequest,
  SpaceMember,
  UpdateAgendaRequest,
} from "@juntos/contracts";
import type { PoolClient } from "pg";

import type { Database } from "../db/pool.js";
import { SharedDataError, withMemberTransaction } from "../spaces/member-transaction.js";
import { AgendaInputError, AgendaVersionConflict, type AgendaRows, type AgendaStore } from "./agenda-store.js";

type EventRow = {
  id: string;
  space_id: string;
  title: string;
  date: Date | string;
  time: string;
  duration_minutes: number;
  location: string;
  notes: string;
  assignee_id: string | null;
  weekly: boolean;
  recurrence_until: Date | string | null;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type RevisionRow = { revision: string | number | bigint };
type MemberRow = { id: string; name: string; avatar_url: string | null };

type StoreDependencies = { now?: () => Date; id?: () => string };

const EVENT_COLUMNS = `id, space_id, title, date, time, duration_minutes, location, notes,
  assignee_id, weekly, recurrence_until, version, created_by, updated_by, created_at, updated_at, deleted_at`;

function civilDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function timestamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function agendaEvent(row: EventRow): AgendaEvent {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    date: civilDate(row.date),
    time: row.time,
    durationMinutes: row.duration_minutes,
    location: row.location,
    notes: row.notes,
    assigneeId: row.assignee_id,
    recurrence: row.weekly ? { frequency: "weekly", until: row.recurrence_until === null ? null : civilDate(row.recurrence_until) } : null,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    deletedAt: row.deleted_at === null ? null : timestamp(row.deleted_at),
  };
}

function member(row: MemberRow): SpaceMember {
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url };
}

export class PostgresAgendaStore implements AgendaStore {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(private readonly database: Database, options: StoreDependencies = {}) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
  }

  async read(userId: string): Promise<AgendaRows> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const [state, events, members] = await Promise.all([
        client.query<RevisionRow>("SELECT revision FROM agenda_state WHERE space_id = $1", [spaceId]),
        client.query<EventRow>(
          `SELECT ${EVENT_COLUMNS} FROM agenda_events
           WHERE space_id = $1 AND deleted_at IS NULL
           ORDER BY date, time, id`,
          [spaceId],
        ),
        client.query<MemberRow>(
          `SELECT u.id, u.display_name AS name, u.avatar_url
           FROM memberships AS m
           INNER JOIN users AS u ON u.id = m.user_id
           WHERE m.space_id = $1
           ORDER BY m.joined_at, u.id`,
          [spaceId],
        ),
      ]);
      const revision = state.rows[0]?.revision;
      if (revision === undefined) throw new Error("agenda state is unavailable");
      return { revision: String(revision), events: events.rows.map(agendaEvent), members: members.rows.map(member) };
    });
  }

  async create(userId: string, input: CreateAgendaRequest): Promise<AgendaEvent> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      await this.requireAssignee(client, spaceId, input.event.assigneeId);
      const now = this.now();
      const result = await client.query<EventRow>(
        `INSERT INTO agenda_events (${EVENT_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $12, $13, $13, NULL)
         RETURNING ${EVENT_COLUMNS}`,
        [
          this.id(), spaceId, input.event.title, input.event.date, input.event.time, input.event.durationMinutes,
          input.event.location, input.event.notes, input.event.assigneeId, input.event.recurrence !== null,
          input.event.recurrence?.until ?? null, userId, now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("agenda event creation failed");
      const saved = agendaEvent(row);
      await this.recordWrite(client, spaceId, saved.id, userId, "created", saved.version, now);
      return saved;
    });
  }

  async update(userId: string, id: string, input: UpdateAgendaRequest): Promise<AgendaEvent> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const current = await this.lockEvent(client, spaceId, id);
      if (current.version !== input.expectedVersion || current.deletedAt !== null) throw new AgendaVersionConflict(current);
      await this.requireAssignee(client, spaceId, input.event.assigneeId);
      const now = this.now();
      const result = await client.query<EventRow>(
        `UPDATE agenda_events SET title=$4, date=$5, time=$6, duration_minutes=$7,
           location=$8, notes=$9, assignee_id=$10, weekly=$11, recurrence_until=$12,
           version=version+1, updated_by=$13, updated_at=$14
         WHERE space_id=$1 AND id=$2 AND version=$3 AND deleted_at IS NULL
         RETURNING ${EVENT_COLUMNS}`,
        [
          spaceId, id, input.expectedVersion, input.event.title, input.event.date, input.event.time,
          input.event.durationMinutes, input.event.location, input.event.notes, input.event.assigneeId,
          input.event.recurrence !== null, input.event.recurrence?.until ?? null, userId, now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new AgendaVersionConflict(current);
      const saved = agendaEvent(row);
      await this.recordWrite(client, spaceId, saved.id, userId, "updated", saved.version, now);
      return saved;
    });
  }

  async delete(userId: string, id: string, input: DeleteAgendaRequest): Promise<AgendaEvent> {
    return withMemberTransaction(this.database, userId, async (client, spaceId) => {
      const current = await this.lockEvent(client, spaceId, id);
      if (current.version !== input.expectedVersion || current.deletedAt !== null) throw new AgendaVersionConflict(current);
      const now = this.now();
      const result = await client.query<EventRow>(
        `UPDATE agenda_events SET deleted_at=$4, version=version+1, updated_by=$5, updated_at=$4
         WHERE space_id=$1 AND id=$2 AND version=$3 AND deleted_at IS NULL
         RETURNING ${EVENT_COLUMNS}`,
        [spaceId, id, input.expectedVersion, now, userId],
      );
      const row = result.rows[0];
      if (!row) throw new AgendaVersionConflict(current);
      const saved = agendaEvent(row);
      await this.recordWrite(client, spaceId, saved.id, userId, "deleted", saved.version, now);
      return saved;
    });
  }

  private async lockEvent(client: PoolClient, spaceId: string, id: string): Promise<AgendaEvent> {
    const result = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM agenda_events WHERE space_id = $1 AND id = $2 FOR UPDATE`,
      [spaceId, id],
    );
    const row = result.rows[0];
    if (!row) throw new SharedDataError(404);
    return agendaEvent(row);
  }

  private async requireAssignee(client: PoolClient, spaceId: string, assigneeId: string | null): Promise<void> {
    if (assigneeId === null) return;
    const assignee = await client.query<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE space_id = $1 AND user_id = $2",
      [spaceId, assigneeId],
    );
    if (!assignee.rows[0]) throw new AgendaInputError();
  }

  private async recordWrite(
    client: PoolClient,
    spaceId: string,
    eventId: string,
    userId: string,
    action: "created" | "updated" | "deleted",
    version: number,
    createdAt: Date,
  ): Promise<void> {
    await client.query("UPDATE agenda_state SET revision = revision + 1 WHERE space_id = $1", [spaceId]);
    await client.query(
      `INSERT INTO agenda_activity (id, space_id, event_id, actor_id, action, version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [this.id(), spaceId, eventId, userId, action, version, createdAt],
    );
  }
}
