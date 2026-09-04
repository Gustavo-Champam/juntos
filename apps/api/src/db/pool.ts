import { Pool } from "pg";

export type Database = Pick<Pool, "query" | "connect">;

export function createPool(databaseUrl: string, ssl: boolean): Pool {
  return new Pool({
    connectionString: databaseUrl,
    ssl,
  });
}
