import { z } from "zod";
import { internalProxyKeySchema } from "@juntos/contracts";

const nodeEnvironmentSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const environmentSchema = z
  .object({
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    NODE_ENV: nodeEnvironmentSchema,
    WEB_ORIGIN: z.url().optional(),
    DATABASE_URL: z.url(),
    DATABASE_SSL: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.url(),
    INTERNAL_PROXY_KEY: internalProxyKeySchema,
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
  databaseUrl: string;
  databaseSsl: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  internalProxyKey: string;
};

export function parseConfig(
  environment: Record<string, string | undefined>,
): ApiConfig {
  const nodeEnv = nodeEnvironmentSchema.parse(environment.NODE_ENV);
  const testDefaults =
    nodeEnv === "test"
      ? {
          DATABASE_URL: "postgres://juntos:juntos@localhost:5432/juntos_test",
          DATABASE_SSL: "false",
          GOOGLE_CLIENT_ID: "test-google-client-id",
          GOOGLE_CLIENT_SECRET: "test-google-client-secret",
          GOOGLE_REDIRECT_URI: "http://localhost:4000/auth/google/callback",
          INTERNAL_PROXY_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
        }
      : {};
  const parsed = environmentSchema.parse({ ...testDefaults, ...environment });

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    webOrigin: parsed.WEB_ORIGIN ?? "http://localhost:3000",
    databaseUrl: parsed.DATABASE_URL,
    databaseSsl: parsed.DATABASE_SSL,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: parsed.GOOGLE_REDIRECT_URI,
    internalProxyKey: parsed.INTERNAL_PROXY_KEY,
  };
}
