import "server-only";
import { internalProxyKeySchema } from "@juntos/contracts";
import { cookies } from "next/headers";

import { createBackendClient } from "./api-client-core";
import { getClientId } from "./auth-cookies";

export function getInternalProxyKey(): string {
  const result = internalProxyKeySchema.safeParse(process.env.INTERNAL_PROXY_KEY);
  if (!result.success) throw new Error("Invalid internal proxy key configuration");
  return result.data;
}

export async function backendFetch(
  path: string,
  init?: RequestInit,
  session?: string,
): Promise<Response> {
  const apiBaseUrl = process.env.API_BASE_URL;
  const proxyKey = getInternalProxyKey();

  if (!apiBaseUrl) {
    throw new Error("Backend configuration is required");
  }

  const clientId = getClientId(await cookies());
  return createBackendClient({ baseUrl: apiBaseUrl, fetcher: fetch, proxyKey, clientId })(path, init, session);
}
