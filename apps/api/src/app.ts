import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyServerOptions } from "fastify";

import healthRoutes from "./routes/health.js";

type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  webOrigin: string;
};

export function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
  });
  app.register(healthRoutes);

  return app;
}
