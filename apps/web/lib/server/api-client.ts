import "server-only";
import { cookies } from "next/headers";

import { createBackendClient } from "./api-client-core";
import { getClientId } from "./auth-cookies";

export async function backendFetch(
  path: string,
  init?: RequestInit,
  session?: string,
): Promise<Response> {
  const apiBaseUrl = process.env.API_BASE_URL;
  const proxyKey = process.env.INTERNAL_PROXY_KEY;

  if (!apiBaseUrl || !proxyKey) {
    throw new Error("Backend configuration is required");
  }

  const clientId = getClientId(await cookies());
  return createBackendClient({ baseUrl: apiBaseUrl, fetcher: fetch, proxyKey, clientId })(path, init, session);
}
