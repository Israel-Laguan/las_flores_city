import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const { Pool } = pg;

// OLTP Database Connection (Main Game State)
// Task 5.4: max increased to 50 to sustain 500+ concurrent VU load tests
// without exhausting connections. Combined with PgBouncer in production.
export const oltpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                  // Max connections in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 2000, // Fail if no connection available within 2s
});

// OLAP Database Connection (Analytics)
// Task 5.4: connectionTimeoutMillis reduced to 1000ms so telemetry queries
// fail fast instead of holding Express request threads open when OLAP is degraded.
export const olapPool = new Pool({
  connectionString: process.env.ANALYTICS_DATABASE_URL,
  max: 20,                  // Slightly larger headroom for background telemetry bursts
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 1000, // Fail fast — telemetry must never block gameplay
});

// Test database connections
export async function testConnections(): Promise<boolean> {
  try {
    // Test OLTP connection
    const oltpClient = await oltpPool.connect();
    console.log('✅ OLTP Database connected');
    oltpClient.release();

    // Test OLAP connection
    const olapClient = await olapPool.connect();
    console.log('✅ OLAP Database connected');
    olapClient.release();

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

let connectionsClosed = false;

// Close database connections
export async function closeConnections(): Promise<void> {
  if (connectionsClosed) {
    return;
  }

  connectionsClosed = true;
  await oltpPool.end();
  await olapPool.end();
  console.log('🔌 Database connections closed');
}

// Query helpers
export async function queryOLTP<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return oltpPool.query<T>(text, params);
}

/**
 * OLAP telemetry query wrapper (fire-and-forget safe).
 *
 * Task 5.4: Catches and logs errors internally so that controllers calling
 * `queryOLAP(...)` without `.catch()` never produce an UnhandledPromiseRejection
 * that would crash the Node.js process. Returns null on failure so callers can
 * safely chain `.then()` or ignore the result.
 */
export async function queryOLAP<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T> | null> {
  try {
    return await olapPool.query<T>(text, params);
  } catch (error) {
    // Swallow and log — OLAP telemetry is non-critical.
    // Controllers are expected to call this without await; an unhandled
    // rejection here would otherwise crash the process.
    console.error('[OLAP TELEMETRY DROPPED]', error);
    return null;
  }
}

// Transaction helpers
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

export async function withOLAPTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await olapPool.connect();
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
