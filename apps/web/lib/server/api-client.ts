import "server-only";

import { createBackendClient } from "./api-client-core";

export function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error("API_BASE_URL is required");
  }

  return createBackendClient({ baseUrl: apiBaseUrl, fetcher: fetch })(path, init);
}
