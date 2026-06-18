import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

// ============================================================
// Admin Database Connection (Task 5.2 Foundations)
//
// Mirrors server/src/database/connection.ts — same contract,
// separate process. The admin container runs its own Node/Next
// process and cannot import from server/src/. The helpers below
// are byte-compatible with the server's oltpPool +
// withOLTPTransaction so that future admin API routes use the
// exact same patterns as server routes.
//
// No auth in this slice — admin auth is deferred to Task 5.2
// proper. Until then, port 3001 must NOT be publicly exposed.
// ============================================================

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const { Pool } = pg;

// OLTP Database Connection (Main Game State) — same config as server.
export const oltpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let poolClosed = false;

// Close database connections (call on graceful shutdown).
export async function closeConnections(): Promise<void> {
  if (poolClosed) {
    return;
  }
  poolClosed = true;
  await oltpPool.end();
  console.log('🔌 Admin database connection closed');
}

// Transaction helper — identical contract to the server's
// withOLTPTransaction. Future admin routes (UGC approve, etc.)
// use this for atomic status updates.
export async function withOLTPTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await oltpPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
