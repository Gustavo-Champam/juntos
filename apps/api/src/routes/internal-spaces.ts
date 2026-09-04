import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  createSpaceRequestSchema,
} from "@juntos/contracts";
import type { FastifyPluginAsync } from "fastify";

import {
  authenticateSession,
  sendRequestFailure,
  type InternalRouteDependencies,
} from "./internal-auth.js";

const internalSpacesRoutes: FastifyPluginAsync<InternalRouteDependencies> =
  async (app, dependencies) => {
    app.post("/spaces", async (request, reply) => {
      const authenticated = await authenticateSession(
        request,
        reply,
        dependencies.sessionService,
      );
      if (!authenticated) return;
      const parsed = createSpaceRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        await sendRequestFailure(request, reply, 400);
        return;
      }
      try {
        await reply.send(
          await dependencies.spaceService.createSpace(
            authenticated.user.id,
            parsed.data.name,
          ),
        );
      } catch {
        await sendRequestFailure(request, reply, 400);
      }
    });

    app.post("/spaces/leave", async (request, reply) => {
      const authenticated = await authenticateSession(
        request,
        reply,
        dependencies.sessionService,
      );
      if (!authenticated) return;
      try {
        await reply.send(
          await dependencies.spaceService.leaveSpace(authenticated.user.id),
        );
      } catch {
        await sendRequestFailure(request, reply, 400);
      }
    });

    app.post("/invitations", async (request, reply) => {
      const authenticated = await authenticateSession(
        request,
        reply,
        dependencies.sessionService,
      );
      if (!authenticated) return;
      const parsed = createInvitationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        await sendRequestFailure(request, reply, 400);
        return;
      }
      try {
        await reply.send(
          await dependencies.spaceService.createInvitation(
            authenticated.user.id,
            parsed.data.invitedEmail,
          ),
        );
      } catch {
        await sendRequestFailure(request, reply, 400);
      }
    });

    app.post("/invitations/accept", async (request, reply) => {
      const authenticated = await authenticateSession(
        request,
        reply,
        dependencies.sessionService,
      );
      if (!authenticated) return;
      const parsed = acceptInvitationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        await sendRequestFailure(request, reply, 400);
        return;
      }
      try {
        await reply.send(
          await dependencies.spaceService.acceptInvitation(
            authenticated.user.id,
            parsed.data.token,
          ),
        );
      } catch {
        await sendRequestFailure(request, reply, 400);
      }
    });
  };

export default internalSpacesRoutes;
