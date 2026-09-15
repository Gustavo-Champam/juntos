import { Pool } from "pg";

export type Database = Pick<Pool, "query" | "connect">;

const connectionStringTlsParameters = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslnegotiation",
  "sslrootcert",
  "uselibpqcompat",
]);

export function createPool(databaseUrl: string, ssl: boolean): Pool {
  if (ssl) {
    for (const [name] of new URL(databaseUrl).searchParams) {
      if (connectionStringTlsParameters.has(name.toLowerCase())) {
        throw new Error(
          "DATABASE_URL must not specify TLS parameters when DATABASE_SSL=true",
        );
      }
    }
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  });
}
