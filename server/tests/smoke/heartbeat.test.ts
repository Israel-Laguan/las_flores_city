import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

describe('Infrastructure Heartbeat', () => {
  let oltpPool: pg.Pool;
  let olapPool: pg.Pool;
  let redis: Redis;

  beforeAll(async () => {
    oltpPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5432/las_flores',
      connectionTimeoutMillis: 5000,
    });
    olapPool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
      connectionTimeoutMillis: 5000,
    });
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeoutOnClick: false,
    });
  });

  afterAll(async () => {
    await oltpPool.end();
    await olapPool.end();
    redis.disconnect();
  });

  test('OLTP PostgreSQL responds to SELECT 1', async () => {
    const result = await oltpPool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  test('OLAP PostgreSQL responds to SELECT 1', async () => {
    const result = await olapPool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  test('Redis responds to PING with PONG', async () => {
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });

  test('OLTP database has required tables', async () => {
    const expectedTables = [
      'users',
      'time_blocks',
      'characters',
      'dialogue_trees',
      'dialogue_overlays',
      'scenes',
      'player_states',
      'migration_log',
    ];

    const result = await oltpPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const tables = result.rows.map((r: any) => r.table_name);
    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }
  });

  test('OLAP database has player_events table', async () => {
    const result = await olapPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const tables = result.rows.map((r: any) => r.table_name);
    expect(tables).toContain('player_events');
  });

  test('Redis SET/GET works correctly', async () => {
    await redis.set('test:heartbeat', 'ok');
    const value = await redis.get('test:heartbeat');
    expect(value).toBe('ok');
    await redis.del('test:heartbeat');
  });
});
