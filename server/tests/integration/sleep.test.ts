import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import { playerRouter } from '../../src/routes/player.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000020';
const APARTMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const CAFE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
const DISTRICT_ID = 'd2000000-0000-0000-0000-000000000001';

const app = express();
app.use(express.json());
app.use('/player', playerRouter);

let server: any;
let pool: pg.Pool;
let analyticsPool: pg.Pool;

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  analyticsPool = new Pool({
    connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
    connectionTimeoutMillis: 5000,
  });

  // Ensure the district exists for the scenes
  await pool.query(
    `INSERT INTO districts (id, name, slug, description, x, y)
     VALUES ($1, $2, $3, $4, 0, 0)
     ON CONFLICT (id) DO NOTHING`,
    [DISTRICT_ID, 'Sleep Test District', 'sleep-test-district', 'District for sleep test']
  );

  // Ensure the apartment and cafe scenes exist for the foreign key reference
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, $2, $3, $4, '{"type": "starting_location", "accessible": true, "is_sleep_location": true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [APARTMENT_ID, 'The Apartment', 'Test apartment location', DISTRICT_ID]
  );
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, $2, $3, $4, '{"type": "location", "accessible": true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [CAFE_ID, 'The Cafe', 'Test cafe location', DISTRICT_ID]
  );

  await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       updated_at = NOW()`,
    [TEST_USER_ID, 'sleep-test@example.com', 'sleep_test', 'Sleep Test']
  );
  await pool.query(
    `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET
       time_blocks = 48,
       credits = 100,
       current_location_id = $2,
       current_day = 1,
       updated_at = NOW()`,
    [TEST_USER_ID, APARTMENT_ID]
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
  await pool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  // Null out FK references to scenes before deleting them
  await pool.query('UPDATE player_states SET current_location_id = NULL WHERE current_location_id IN ($1, $2)', [APARTMENT_ID, CAFE_ID]);
  await pool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  // Clean up test-specific fixtures: scenes and district created by this suite.
  await pool.query('DELETE FROM scenes WHERE id IN ($1, $2)', [APARTMENT_ID, CAFE_ID]);
  await pool.query('DELETE FROM districts WHERE id = $1', [DISTRICT_ID]);
  await analyticsPool.query('DELETE FROM player_events WHERE user_id = $1', [TEST_USER_ID]);
  await pool.end();
  await analyticsPool.end();
  await closeRedis();
});

beforeEach(async () => {
  await pool.query(
    `UPDATE player_states SET time_blocks = 48, credits = 100, current_location_id = $1, current_day = 1, current_node_id = NULL WHERE user_id = $2`,
    [APARTMENT_ID, TEST_USER_ID]
  );
  await pool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await analyticsPool.query('DELETE FROM player_events WHERE user_id = $1 AND event_type = $2', [TEST_USER_ID, 'sleep']);
});

describe('POST /player/sleep', () => {
  test('resets time_blocks to 48 and increments current_day', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('time_blocks', 48);
    expect(data.data).toHaveProperty('current_day', 2);
  });

  test('deducts rent of 10 credits', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toHaveProperty('credits', 90);
    expect(data.data).toHaveProperty('credits_deducted', 10);
    expect(data.data).toHaveProperty('rent_paid', true);
  });

  test('returns 403 when not at apartment', async () => {
    await pool.query(
      'UPDATE player_states SET current_location_id = $1 WHERE user_id = $2',
      [CAFE_ID, TEST_USER_ID]
    );

    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toHaveProperty('success', false);
    expect(data.error).toContain('cannot sleep here');
  });

  test('allows negative credits (overdraft)', async () => {
    await pool.query(
      'UPDATE player_states SET credits = 5 WHERE user_id = $1',
      [TEST_USER_ID]
    );

    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toHaveProperty('credits', -5);
    expect(data.data).toHaveProperty('overdraft', true);
  });

  test('creates bank transaction ledger entry', async () => {
    const port = server.address().port;
    await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    const result = await pool.query(
      `SELECT transaction_type, amount, description, balance_after, reference_type
       FROM bank_transactions
       WHERE user_id = $1 AND reference_type = 'rent'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_USER_ID]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].transaction_type).toBe('debit');
    expect(result.rows[0].amount).toBe(10);
    expect(result.rows[0].description).toContain('Rent');
    expect(result.rows[0].balance_after).toBe(90);
    expect(result.rows[0].reference_type).toBe('rent');
  });

  test('clears current_node_id', async () => {
    await pool.query(
      'UPDATE player_states SET current_node_id = $1 WHERE user_id = $2',
      ['some-node-id', TEST_USER_ID]
    );

    const port = server.address().port;
    await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    const result = await pool.query(
      'SELECT current_node_id FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );

    expect(result.rows[0].current_node_id).toBeNull();
  });

  test('emits sleep event to OLAP', async () => {
    const port = server.address().port;
    await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    const result = await analyticsPool.query(
      `SELECT event_type, event_data, time_blocks_cost
       FROM player_events
       WHERE user_id = $1 AND event_type = 'sleep'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_USER_ID]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].event_type).toBe('sleep');
    expect(result.rows[0].time_blocks_cost).toBe(0);

    const eventData = result.rows[0].event_data;
    expect(eventData).toHaveProperty('completed_day', 1);
    expect(eventData).toHaveProperty('credits_deducted', 10);
    expect(eventData).toHaveProperty('new_day', 2);
  });

  test('returns 401 without auth token', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
  });

  test('increments day across multiple sleeps', async () => {
    const port = server.address().port;

    const res1 = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data1 = await res1.json();
    expect(data1.data.current_day).toBe(2);

    const res2 = await fetch(`http://localhost:${port}/player/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data2 = await res2.json();
    expect(data2.data.current_day).toBe(3);
  });
});
