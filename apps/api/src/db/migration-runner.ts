import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Database } from "./pool.js";

const createMigrationsTable = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

export async function applyMigrations(
  pool: Database,
  migrationsDirectory: string,
): Promise<void> {
  const migrationFiles = (await readdir(migrationsDirectory, {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(createMigrationsTable);

    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const appliedFilenames = new Set(applied.rows.map((row) => row.filename));

    for (const filename of migrationFiles) {
      if (appliedFilenames.has(filename)) {
        continue;
      }

      const migration = await readFile(path.join(migrationsDirectory, filename), "utf8");
      await client.query(migration);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [filename],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
