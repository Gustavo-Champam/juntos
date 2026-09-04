import "server-only";

type BackendClientOptions = {
  baseUrl: string;
  fetcher: typeof fetch;
  proxyKey: string;
  clientId: string;
};

export function createBackendClient({
  baseUrl,
  fetcher,
  proxyKey,
  clientId,
}: BackendClientOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return async function backendFetch(
    path: string,
    init: RequestInit = {},
    session?: string,
  ): Promise<Response> {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(path) || path.startsWith("//")) {
      throw new Error("Expected a backend-relative path beginning with one slash");
    }

    if (!proxyKey || !/^[a-f0-9]{64}$/.test(clientId)) throw new Error("Missing internal credentials");
    if (session !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(session)) throw new Error("Invalid session");
    const headers = new Headers(init.headers);
    headers.set("x-juntos-proxy-key", proxyKey);
    headers.set("x-juntos-client-id", clientId);
    headers.delete("authorization");
    if (session) headers.set("authorization", `Bearer ${session}`);

    return fetcher(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
    });
  };
}
