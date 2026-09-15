import type { PoolClient } from "pg";

import type { Database } from "../db/pool.js";

export class SharedDataError extends Error {
  constructor(readonly status: 403 | 404 | 409) {
    super("shared_data_unavailable");
    this.name = "SharedDataError";
  }
}

export async function withMemberTransaction<T>(
  database: Database,
  userId: string,
  run: (client: PoolClient, spaceId: string) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");

    const membership = await client.query<{ space_id: string }>(
      "SELECT space_id FROM memberships WHERE user_id = $1",
      [userId],
    );
    const spaceId = membership.rows[0]?.space_id;
    if (!spaceId) throw new SharedDataError(403);

    const space = await client.query<{ id: string }>(
      "SELECT id FROM couple_spaces WHERE id = $1 AND archived_at IS NULL FOR UPDATE",
      [spaceId],
    );
    if (!space.rows[0]) throw new SharedDataError(403);

    const activeMembership = await client.query<{ space_id: string }>(
      "SELECT space_id FROM memberships WHERE user_id = $1 AND space_id = $2 FOR UPDATE",
      [userId, spaceId],
    );
    if (!activeMembership.rows[0]) throw new SharedDataError(403);

    await client.query(
      "INSERT INTO agenda_state (space_id) VALUES ($1) ON CONFLICT (space_id) DO NOTHING",
      [spaceId],
    );
    await client.query(
      "SELECT revision FROM agenda_state WHERE space_id = $1 FOR UPDATE",
      [spaceId],
    );

    const result = await run(client, spaceId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
