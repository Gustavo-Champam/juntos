import { timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

type ConstantTimeCompare = (left: Uint8Array, right: Uint8Array) => boolean;
const trustedClientIdPattern = /^[a-f0-9]{64}$/;

export function getTrustedClientId(
  clientId: string | string[] | undefined,
): string | null {
  return typeof clientId === "string" && trustedClientIdPattern.test(clientId)
    ? clientId
    : null;
}

export function constantTimeKeyEquals(
  provided: string,
  expected: string,
  compare: ConstantTimeCompare = timingSafeEqual,
): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return compare(providedBuffer, expectedBuffer);
}

export function buildInternalRequestGuard(expectedKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const providedKey = request.headers["x-juntos-proxy-key"];
    if (
      typeof providedKey !== "string" ||
      !constantTimeKeyEquals(providedKey, expectedKey)
    ) {
      await reply.code(404).send({ error: "request_failed" });
      return;
    }
    if (!getTrustedClientId(request.headers["x-juntos-client-id"])) {
      await reply.code(400).send({ error: "request_failed" });
    }
  };
}
