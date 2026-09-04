import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController } from "fastify";
import type { FastifyServerOptions } from "fastify";

import healthRoutes from "./routes/health.js";
import internalAuthRoutes, {
  logRequestFailure,
  type InternalRouteDependencies,
} from "./routes/internal-auth.js";
import internalSpacesRoutes from "./routes/internal-spaces.js";
import {
  buildInternalRequestGuard,
  getTrustedClientId,
} from "./security/internal-request.js";

type IdentityAppDependencies = InternalRouteDependencies & {
  internalProxyKey: string;
};

type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  webOrigin: string;
  identity?: IdentityAppDependencies;
};

export function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 16 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
  });
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });
  app.register(healthRoutes);

  app.setErrorHandler(async (error, request, reply) => {
    const candidate = typeof error === "object" && error !== null && "statusCode" in error
      ? error.statusCode
      : undefined;
    const status = typeof candidate === "number" && candidate >= 400 && candidate <= 599
      ? candidate
      : 500;
    logRequestFailure(request, status);
    await reply.code(status).send({ error: "request_failed" });
  });

  if (options.identity) {
    const dependencies = options.identity;
    app.register(
      async (internal) => {
        internal.addHook("onRequest", async (_request, reply) => {
          reply.header("Cache-Control", "no-store");
        });
        internal.addHook(
          "onRequest",
          buildInternalRequestGuard(dependencies.internalProxyKey),
        );
        await internal.register(rateLimit, {
          global: true,
          max: 60,
          timeWindow: "15 minutes",
          keyGenerator: (request) =>
            getTrustedClientId(request.headers["x-juntos-client-id"]) ?? "invalid-client",
        });
        await internal.register(internalAuthRoutes, dependencies);
        await internal.register(internalSpacesRoutes, dependencies);
        internal.setNotFoundHandler(async (request, reply) => {
          reply.header("Cache-Control", "no-store");
          logRequestFailure(request, 404);
          await reply.code(404).send({ error: "request_failed" });
        });
      },
      { prefix: "/internal" },
    );
  }

  return app;
}
