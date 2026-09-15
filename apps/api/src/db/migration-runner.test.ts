import { fileURLToPath } from "node:url";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "./migration-runner.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

describe("applyMigrations", () => {
  it("creates the identity and agenda tables and enforces UUID relationships", async () => {
    const database = newDb({ noAstCoverageCheck: true });
    database.public.registerFunction({
      name: "octet_length",
      args: [DataType.bytea],
      returns: DataType.integer,
      implementation: (value: Buffer) => value.length,
    });
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();

    await applyMigrations(pool, migrationsDirectory);

    const tables = (await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    )) as { rows: Array<{ table_name: string }> };

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "agenda_activity",
      "agenda_events",
      "agenda_state",
      "couple_spaces",
      "invitations",
      "meal_plans",
      "memberships",
      "schema_migrations",
      "sessions",
      "shopping_items",
      "space_prefs",
      "users",
    ]);

    await expect(
      pool.query(
        "insert into couple_spaces (id, name, created_by) values ('00000000-0000-0000-0000-000000000001', 'Casa', '00000000-0000-0000-0000-000000000002')",
      ),
    ).rejects.toThrow();
  });

  it("records a migration once when applied repeatedly", async () => {
    const database = newDb({ noAstCoverageCheck: true });
    database.public.registerFunction({
      name: "octet_length",
      args: [DataType.bytea],
      returns: DataType.integer,
      implementation: (value: Buffer) => value.length,
    });
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();

    await applyMigrations(pool, migrationsDirectory);
    await applyMigrations(pool, migrationsDirectory);

    const applied = (await pool.query(
      "select filename from schema_migrations order by filename",
    )) as { rows: Array<{ filename: string }> };
    expect(applied.rows).toEqual([
      { filename: "0001_identity.sql" },
      { filename: "0002_agenda.sql" },
      { filename: "0003_meals_shopping.sql" },
      { filename: "0004_meal_time.sql" },
    ]);
  });
});
