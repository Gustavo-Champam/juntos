import { z } from "zod";

// A canonical unpadded base64url encoding of 32 bytes is 43 characters long.
// The final character can only carry the last two data bits.
export const internalProxyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/, "INTERNAL_PROXY_KEY must be a canonical 32-byte base64url value")
  .refine((value) => new Set(value).size >= 8, "INTERNAL_PROXY_KEY must be randomly generated");
