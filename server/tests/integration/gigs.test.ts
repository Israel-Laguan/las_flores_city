/**
 * Gig Engine Integration Tests
 *
 * 2.3a: GET /gigs returns validated gig list
 * 2.3b: POST /gigs/execute atomically deducts TBs and credits payout
 * 2.3c: Insufficient TBs returns 400, DB unchanged
 * 2.3d: Unknown gigId returns 404
 * 2.3e: OLAP telemetry row is written on success
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import { gigsRouter } from '../../src/routes/gigs.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

const APARTMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000077';

const GIG_NOODLE   = '880e8400-e29b-41d4-a716-446655440001'; // cost 16, payout 50
const GIG_COURIER  = '880e8400-e29b-41d4-a716-446655440002'; // cost 24, payout 90

const app = express();
app.use(express.json());
app.use('/gigs', gigsRouter);

let server: ReturnType<typeof app.listen>;
let oltpPool: pg.Pool;
let olapPool: pg.Pool;
let port: number;

function auth() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

async function post(path: string, body: object) {
  return fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(body),
  });
}

async function get(path: string) {
  return fetch(`http://localhost:${port}${path}`, { headers: auth() });
}

async function resetPlayer(timeBlocks: number, credits: number) {
  await oltpPool.query(
    `UPDATE player_states SET time_blocks = $1, credits = $2, updated_at = NOW() WHERE user_id = $3`,
    [timeBlocks, credits, TEST_USER_ID]
  );
}

beforeAll(async () => {
  oltpPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });
  olapPool = new Pool({
    connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
    connectionTimeoutMillis: 5000,
  });

  await oltpPool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'gig-test@example.com', 'gig_test', 'Gig Test')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, username = EXCLUDED.username, updated_at = NOW()`,
    [TEST_USER_ID]
  );
  await oltpPool.query(
    `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET time_blocks = 48, credits = 100, current_location_id = $2, updated_at = NOW()`,
    [TEST_USER_ID, APARTMENT_ID]
  );

  server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(e => (e ? reject(e) : resolve()))
  );
  await oltpPool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await oltpPool.end();
  await olapPool.end();
  await closeRedis();
});

// ─────────────────────────────────────────────────────────────────────────────
describe(' GET /gigs returns validated gig list', () => {
  test('returns array with correct shape', async () => {
    const res  = await get('/gigs');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      time_block_cost: expect.any(Number),
      credit_payout: expect.any(Number),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe(' POST /gigs/execute happy path', () => {
  test('deducts TBs and pays out credits atomically', async () => {
    await resetPlayer(48, 100);

    const res  = await post('/gigs/execute', { gigId: GIG_NOODLE });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.newTimeBlocks).toBe(48 - 16); // 32

    const row = await oltpPool.query(
      'SELECT time_blocks, credits FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );
    expect(row.rows[0].time_blocks).toBe(32);
    expect(row.rows[0].credits).toBe(150); // 100 + 50
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe(' Insufficient TBs', () => {
  test('returns 400 and does not mutate DB', async () => {
    await resetPlayer(10, 100); // 10 < 16 (noodle cost)

    const res  = await post('/gigs/execute', { gigId: GIG_NOODLE });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('INSUFFICIENT_TIME_BLOCKS');

    const row = await oltpPool.query(
      'SELECT time_blocks, credits FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );
    expect(row.rows[0].time_blocks).toBe(10);
    expect(row.rows[0].credits).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe(' Unknown gigId returns 404', () => {
  test('unknown UUID returns 404', async () => {
    const res = await post('/gigs/execute', { gigId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('GIG_NOT_FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe(' OLAP telemetry', () => {
  test('gig_completed event is written to player_events', async () => {
    await resetPlayer(48, 100);

    await post('/gigs/execute', { gigId: GIG_COURIER });

    // Give the async fire-and-forget a moment to settle
    await new Promise(r => setTimeout(r, 200));

    const result = await olapPool.query(
      `SELECT event_type, event_data, time_blocks_cost
       FROM player_events
       WHERE user_id = $1 AND event_type = 'gig_completed'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_USER_ID]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].event_type).toBe('gig_completed');
    expect(result.rows[0].time_blocks_cost).toBe(24);
    expect(result.rows[0].event_data.gig_id).toBe(GIG_COURIER);
  });
});
