import { healthResponseSchema } from "@juntos/contracts";

type BackendFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function createBackendHealthHandler(backendFetch: BackendFetch) {
  return async function getBackendHealth(): Promise<Response> {
    try {
      const backendResponse = await backendFetch("/health");

      if (!backendResponse.ok) {
        throw new Error("Backend health check failed");
      }

      const payload = healthResponseSchema.parse(await backendResponse.json());
      return Response.json(payload);
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
  };
}
