import { createHash } from "node:crypto";

import {
  googleExchangeRequestSchema,
  type PublicUser,
} from "@juntos/contracts";
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import type {
  GoogleIdentity,
  GoogleIdentityAdapter,
} from "../identity/google-identity.js";
import type { SessionService } from "../identity/session-service.js";
import type { SpaceService } from "../spaces/space-service.js";

export type GoogleIdentityExchange = Pick<GoogleIdentityAdapter, "exchange"> | {
  exchange(request: {
    code: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<GoogleIdentity>;
};

export type InternalRouteDependencies = {
  googleIdentity: GoogleIdentityExchange;
  sessionService: SessionService;
  spaceService: SpaceService;
};

export type AuthenticatedSession = {
  token: string;
  user: PublicUser;
};

export function logRequestFailure(request: FastifyRequest, status: number) {
  request.log.warn({
    event: "request_failed",
    requestId: request.id,
    status,
    correlationId: createHash("sha256").update(request.id).digest("hex"),
  });
}

export async function sendRequestFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
) {
  logRequestFailure(request, status);
  await reply.code(status).send({ error: "request_failed" });
}

export async function authenticateSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionService: SessionService,
): Promise<AuthenticatedSession | null> {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string"
    ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)
    : null;
  const token = match?.[1];
  if (!token) {
    await sendRequestFailure(request, reply, 401);
    return null;
  }
  const user = await sessionService.authenticate(token);
  if (!user) {
    await sendRequestFailure(request, reply, 401);
    return null;
  }
  return { token, user };
}

const internalAuthRoutes: FastifyPluginAsync<InternalRouteDependencies> = async (
  app,
  dependencies,
) => {
  app.post(
    "/auth/google/exchange",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
    },
    async (request, reply) => {
      const parsed = googleExchangeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        await sendRequestFailure(request, reply, 400);
        return;
      }

      try {
        const identity = await dependencies.googleIdentity.exchange(parsed.data);
        const { sessionToken, user } =
          await dependencies.sessionService.createForGoogleIdentity(identity);
        const bootstrap = await dependencies.spaceService.getBootstrap(user.id);
        await reply.send({ sessionToken, user: bootstrap.user, space: bootstrap.space });
      } catch {
        await sendRequestFailure(request, reply, 400);
      }
    },
  );

  app.get("/bootstrap", async (request, reply) => {
    const authenticated = await authenticateSession(
      request,
      reply,
      dependencies.sessionService,
    );
    if (!authenticated) return;
    try {
      await reply.send(
        await dependencies.spaceService.getBootstrap(authenticated.user.id),
      );
    } catch {
      await sendRequestFailure(request, reply, 400);
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const authenticated = await authenticateSession(
      request,
      reply,
      dependencies.sessionService,
    );
    if (!authenticated) return;
    try {
      await dependencies.sessionService.revoke(authenticated.token);
      await reply.code(204).send();
    } catch {
      await sendRequestFailure(request, reply, 400);
    }
  });
};

export default internalAuthRoutes;
