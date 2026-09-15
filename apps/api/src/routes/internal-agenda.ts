import type { FastifyPluginAsync } from "fastify";

import type { AgendaService } from "../agenda/agenda-service.js";
import { AgendaInputError, AgendaVersionConflict } from "../agenda/agenda-store.js";
import { SharedDataError } from "../spaces/member-transaction.js";
import {
  authenticateSession,
  sendRequestFailure,
  type InternalRouteDependencies,
} from "./internal-auth.js";

export type AgendaRouteDependencies = InternalRouteDependencies & {
  agendaService: AgendaService;
};

function statusOf(error: unknown): number {
  if (error instanceof AgendaVersionConflict) return 409;
  if (error instanceof AgendaInputError) return 400;
  if (error instanceof SharedDataError) return error.status;
  return 502;
}

const internalAgendaRoutes: FastifyPluginAsync<AgendaRouteDependencies> = async (
  app,
  dependencies,
) => {
  app.post("/agenda/list", async (request, reply) => {
    const authenticated = await authenticateSession(request, reply, dependencies.sessionService);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { from?: string; to?: string };
    try {
      await reply.send(
        await dependencies.agendaService.list(authenticated.user.id, {
          from: String(body.from ?? ""),
          to: String(body.to ?? ""),
        }),
      );
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/agenda/create", async (request, reply) => {
    const authenticated = await authenticateSession(request, reply, dependencies.sessionService);
    if (!authenticated) return;
    try {
      await reply.send(await dependencies.agendaService.create(authenticated.user.id, request.body as never));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/agenda/update", async (request, reply) => {
    const authenticated = await authenticateSession(request, reply, dependencies.sessionService);
    if (!authenticated) return;
    const body = request.body as { id: string; expectedVersion: number; event: never };
    try {
      await reply.send(
        await dependencies.agendaService.update(authenticated.user.id, body.id, {
          expectedVersion: body.expectedVersion,
          event: body.event,
        }),
      );
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/agenda/delete", async (request, reply) => {
    const authenticated = await authenticateSession(request, reply, dependencies.sessionService);
    if (!authenticated) return;
    const body = request.body as { id: string; expectedVersion: number; confirmed: true };
    try {
      await reply.send(
        await dependencies.agendaService.delete(authenticated.user.id, body.id, {
          expectedVersion: body.expectedVersion,
          confirmed: true,
        }),
      );
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });
};

export default internalAgendaRoutes;
