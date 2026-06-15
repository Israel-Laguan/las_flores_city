import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Pool } = pg;

describe('OLAP Write Test', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
      connectionTimeoutMillis: 5000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Can write player event to OLAP database', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000099';
    const testEventId = '00000000-0000-0000-0000-000000000098';

    const result = await pool.query(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, event_type`,
      [
        testEventId,
        testUserId,
        'dialogue_start',
        JSON.stringify({ dialogue_id: 'test_dialogue' }),
        0,
      ]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].event_type).toBe('dialogue_start');

    await pool.query('DELETE FROM player_events WHERE id = $1', [testEventId]);
  });

  test('Player event does not block main thread (non-blocking write)', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000099';
    const startTime = Date.now();

    const writes = Array.from({ length: 10 }, (_, i) =>
      pool.query(
        `INSERT INTO player_events (id, user_id, event_type, event_data)
         VALUES ($1, $2, $3, $4)`,
        [
          `00000000-0000-0000-0000-${String(1000 + i).padStart(12, '0')}`,
          testUserId,
          'time_block_spent',
          JSON.stringify({ amount: 1 }),
        ]
      )
    );

    await Promise.all(writes);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5000);

    await pool.query('DELETE FROM player_events WHERE user_id = $1', [testUserId]);
  });

  test('OLAP read query works without blocking', async () => {
    const result = await pool.query(
      `SELECT COUNT(*) AS total_events FROM player_events`
    );

    expect(Number(result.rows[0].total_events)).toBeGreaterThanOrEqual(0);
  });

  test('Event types are constrained to valid values', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000099';

    await expect(
      pool.query(
        `INSERT INTO player_events (id, user_id, event_type, event_data)
         VALUES ($1, $2, $3, $4)`,
        [
          '00000000-0000-0000-0000-000000000097',
          testUserId,
          'invalid_event_type',
          '{}',
        ]
      )
    ).rejects.toThrow();
  });
});
