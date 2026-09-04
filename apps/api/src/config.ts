import { z } from "zod";

const environmentSchema = z
  .object({
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WEB_ORIGIN: z.url().optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.WEB_ORIGIN) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "WEB_ORIGIN is required in production",
      });
    }
  });

export type ApiConfig = {
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  webOrigin: string;
};

export function parseConfig(
  environment: Record<string, string | undefined>,
): ApiConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    webOrigin: parsed.WEB_ORIGIN ?? "http://localhost:3000",
  };
}
