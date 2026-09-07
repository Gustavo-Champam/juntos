import { z } from "zod";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("juntos-api"),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./identity.js";
export * from "./security.js";
