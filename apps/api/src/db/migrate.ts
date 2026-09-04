import "dotenv/config";

import { fileURLToPath } from "node:url";

import { parseConfig } from "../config.js";
import { applyMigrations } from "./migration-runner.js";
import { createPool } from "./pool.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
const config = parseConfig(process.env);
const pool = createPool(config.databaseUrl, config.databaseSsl);

try {
  await applyMigrations(pool, migrationsDirectory);
} finally {
  await pool.end();
}
