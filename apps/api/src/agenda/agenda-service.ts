import {
  agendaQuerySchema,
  createAgendaRequestSchema,
  deleteAgendaRequestSchema,
  updateAgendaRequestSchema,
  type AgendaEvent,
  type AgendaQuery,
  type AgendaRead,
  type CreateAgendaRequest,
  type DeleteAgendaRequest,
  type UpdateAgendaRequest,
} from "@juntos/contracts";
import { z } from "zod";

import type { AgendaStore } from "./agenda-store.js";
import { expandAgenda } from "./recurrence.js";

const idSchema = z.uuid();

export class AgendaService {
  constructor(private readonly store: AgendaStore) {}

  async list(userId: string, query: AgendaQuery): Promise<AgendaRead> {
    const parsedUserId = idSchema.parse(userId);
    const parsedQuery = agendaQuerySchema.parse(query);
    const rows = await this.store.read(parsedUserId);

    // Revisions are scoped to a caller-selected interval; callers reset one when the interval changes.
    if (parsedQuery.revision === rows.revision) return { changed: false, revision: rows.revision };

    return {
      changed: true,
      snapshot: {
        revision: rows.revision,
        from: parsedQuery.from,
        to: parsedQuery.to,
        members: rows.members,
        occurrences: expandAgenda(rows.events, parsedQuery.from, parsedQuery.to),
      },
    };
  }

  async create(userId: string, input: CreateAgendaRequest): Promise<AgendaEvent> {
    return this.store.create(idSchema.parse(userId), createAgendaRequestSchema.parse(input));
  }

  async update(userId: string, id: string, input: UpdateAgendaRequest): Promise<AgendaEvent> {
    return this.store.update(idSchema.parse(userId), idSchema.parse(id), updateAgendaRequestSchema.parse(input));
  }

  async delete(userId: string, id: string, input: DeleteAgendaRequest): Promise<AgendaEvent> {
    return this.store.delete(idSchema.parse(userId), idSchema.parse(id), deleteAgendaRequestSchema.parse(input));
  }
}
