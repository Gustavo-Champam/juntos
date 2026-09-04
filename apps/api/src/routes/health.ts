import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok" as const,
    service: "juntos-api" as const,
  }));
};

export default healthRoutes;
