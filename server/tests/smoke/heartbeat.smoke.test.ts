import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

describe('Smoke: infrastructure heartbeat', () => {
  let oltpPool: pg.Pool;
  let redis: Redis;

  beforeAll(async () => {
    oltpPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeoutOnClick: false,
    });
  });

  afterAll(async () => {
    await oltpPool.end();
    redis.disconnect();
  });

  test('OLTP PostgreSQL is reachable', async () => {
    const result = await oltpPool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  test('Redis is reachable', async () => {
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });
});
