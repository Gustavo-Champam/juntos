type BackendClientOptions = {
  baseUrl: string;
  fetcher: typeof fetch;
};

export function createBackendClient({
  baseUrl,
  fetcher,
}: BackendClientOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return async function backendFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("Expected a backend-relative path beginning with one slash");
    }

    return fetcher(`${normalizedBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
    });
  };
}
