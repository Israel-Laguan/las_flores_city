import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const { Pool } = pg;

// Lazy database pools — only created when first accessed. Prevents Jest from
// hanging on open TCPWRAP handles when test files import modules that
// transitively pull in this file without actually querying the database.
let _oltpPool: pg.Pool | null = null;
let _olapPool: pg.Pool | null = null;
let _contentPool: pg.Pool | null = null;

function parseContentPoolMax(): number {
  const raw = process.env.CONTENT_POOL_MAX;
  if (raw === undefined || raw === '') return 10;
  if (!/^\d+$/.test(raw)) throw new Error('CONTENT_POOL_MAX must be a positive integer');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('CONTENT_POOL_MAX must be a positive integer');
  }
  return value;
}

function getOltpPool(): pg.Pool {
  if (!_oltpPool) {
    connectionsClosed = false;
    // Pool max increased to 50 to sustain 500+ concurrent VU load tests
    // without exhausting connections. Combined with PgBouncer in production.
    _oltpPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 50,                  // Max connections in pool
      idleTimeoutMillis: 30000, // Close idle clients after 30s
      connectionTimeoutMillis: 5000, // Fail if no connection available within 5s
    });
  }
  return _oltpPool;
}

function getOlapPool(): pg.Pool {
  if (!_olapPool) {
    connectionsClosed = false;
    // connectionTimeoutMillis reduced to 1000ms so telemetry queries
    // fail fast instead of holding Express request threads open when OLAP is degraded.
    _olapPool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
      max: 20,                  // Slightly larger headroom for background telemetry bursts
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 1000, // Fail fast — telemetry must never block gameplay
    });
  }
  return _olapPool;
}

function getContentPool(): pg.Pool {
  if (!_contentPool) {
    connectionsClosed = false;
    // Dedicated read-only content pool (M19 "A1 — Content-read pool"). Same OLTP
    // Postgres as the gameplay `oltpPool`, but used exclusively for *content* reads
    // (dialogue trees/overlays/chunks, scenes, characters, districts, mysteries) so
    // the gameplay pool's connection peak stays flat under read-heavy authoring/data
    // bursts. Player WRITES still go through `oltpPool`/`withOLTPTransaction`.
    //
    // NOTE: The current AGENTS.md hard constraint says "Do not introduce new pools".
    // This additive read-only pool is an intentional milestone override (M19) per
    // explicit direction — see docs/milestones/M19-foundation.md "Implementation
    // decision record". Player writes are never routed here.
    _contentPool = new Pool({
      // CONTENT_DATABASE_URL lets operators point this pool at a true read
      // replica/role; defaults to the OLTP URL when unset.
      connectionString: process.env.CONTENT_DATABASE_URL || process.env.DATABASE_URL,
      // Enforce read-only at the Postgres session level so an accidental
      // `queryContent` write is rejected, even though it shares the OLTP
      // credential. Player writes must go through `oltpPool`/`withOLTPTransaction`.
      options: '-c default_transaction_read_only=on',
      // Small read-only pool; content reads are mostly cache-friendly. Default 10,
      // Optional read-only headroom; validate configuration before constructing
      // the pool so malformed values cannot reach pg.Pool.
      max: parseContentPoolMax(),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return _contentPool;
}

// Proxy-based lazy exports: `oltpPool.query()` / `oltpPool.connect()` etc.
// delegate to the real pool only when first called — no TCPWRAP handle created
// at module-import time.
export const oltpPool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_, prop, receiver) {
    return Reflect.get(getOltpPool(), prop, receiver);
  },
});

export const olapPool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_, prop, receiver) {
    return Reflect.get(getOlapPool(), prop, receiver);
  },
});

// Proxy-based lazy export mirroring `oltpPool`/`olapPool`: no TCPWRAP handle is
// created until a `.query()`/`.connect()` is actually invoked.
export const contentPool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_, prop, receiver) {
    return Reflect.get(getContentPool(), prop, receiver);
  },
});

// Test database connections
export async function testConnections(): Promise<boolean> {
  try {
    // Test OLTP connection
    const oltpClient = await getOltpPool().connect();
    console.log('✅ OLTP Database connected');
    oltpClient.release();

    // Test OLAP connection
    const olapClient = await getOlapPool().connect();
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
  if (_oltpPool) {
    await _oltpPool.end();
    _oltpPool = null;
  }
  if (_olapPool) {
    await _olapPool.end();
    _olapPool = null;
  }
  if (_contentPool) {
    await _contentPool.end();
    _contentPool = null;
  }
  console.log('🔌 Database connections closed');
}

// Query helpers
export async function queryOLTP<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return getOltpPool().query<T>(text, params);
}

/**
 * Content read query wrapper (M19 A1). Routes content-table reads through
 * `contentPool` so the gameplay `oltpPool` peak stays flat. Intended for
 * read-only content queries only — player writes must keep using
 * `queryOLTP`/`withOLTPTransaction`/`oltpPool`.
 */
export async function queryContent<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return getContentPool().query<T>(text, params);
}

/**
 * OLAP telemetry query wrapper (fire-and-forget safe).
 *
 * Catches and logs errors internally so that controllers calling
 * `queryOLAP(...)` without `.catch()` never produce an UnhandledPromiseRejection
 * that would crash the Node.js process. Returns null on failure so callers can
 * safely chain `.then()` or ignore the result.
 */
export async function queryOLAP<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T> | null> {
  try {
    return await getOlapPool().query<T>(text, params);
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
  const client = await getOltpPool().connect();
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
  const client = await getOlapPool().connect();
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
