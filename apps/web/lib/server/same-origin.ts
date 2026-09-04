import "server-only";

export class SameOriginError extends Error {}

export function assertSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== new URL(request.url).origin || (site !== "same-origin" && site !== "none")) {
    throw new SameOriginError("Request origin rejected");
  }
}
