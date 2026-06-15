import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// OLTP Database Connection (Main Game State)
export const oltpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// OLAP Database Connection (Analytics)
export const olapPool = new Pool({
  connectionString: process.env.ANALYTICS_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

// Close database connections
export async function closeConnections(): Promise<void> {
  await oltpPool.end();
  await olapPool.end();
  console.log('🔌 Database connections closed');
}

// Query helpers
export async function queryOLTP<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return oltpPool.query<T>(text, params);
}

export async function queryOLAP<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return olapPool.query<T>(text, params);
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
