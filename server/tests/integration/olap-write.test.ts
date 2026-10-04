import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

// Private to this file (collision-avoidance): asset-cascade.test.ts,
// mvw.integration.test.ts and this suite all used 00000000-...-099 as their
// test user. This suite talks to the *analytics* database (it only ever writes
// player_events and never deletes a users row), but reusing the literal would
// still collide with the OLTP suites' fixtures if either pool ever reached the
// other schema. (shop.test.ts references that literal only as a shop_item_id,
// not as a user.)
const TEST_USER_ID = 'b3000000-0000-4000-8000-000000000098';

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
    // Unconditional cleanup of this suite's fixed-id rows, keyed on BOTH the
    // user id and the event ids. The insert ids below are hard-coded constants,
    // so a run that failed *before* its inline DELETE (e.g. the elapsed-time
    // assertion) used to leave them behind and every later run then died on
    // `duplicate key ... player_events_pkey`. Matching on user_id alone is not
    // enough: an earlier version of this file used a different TEST_USER_ID, so
    // its rows would survive a user_id-only cleanup. afterAll runs on both the
    // pass and fail paths, so the ids are always reclaimed.
    await pool
      .query(
        'DELETE FROM player_events WHERE user_id = $1 OR id = ANY($2::uuid[])',
        [
          TEST_USER_ID,
          [
            '00000000-0000-0000-0000-000000000098',
            '00000000-0000-0000-0000-000000000097',
          ],
        ]
      )
      .catch(() => undefined);
    await pool.end();
  });

  test('Can write player event to OLAP database', async () => {
    const testUserId = TEST_USER_ID;
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
    const testUserId = TEST_USER_ID;
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
    const testUserId = TEST_USER_ID;

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
