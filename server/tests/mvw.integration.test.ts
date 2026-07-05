/**
 * MVW Integration Test Suite + 5.3
 * Tests the "First Hour" gameplay loop end-to-end via HTTP against a real DB.
 *
 * 5.1a: Authentication & Onboarding
 * 5.1b: Dialogue Traversal (state transitions + is_end)
 * 5.1c: State-Sync & Cache Invalidation
 * 5.3a: Invalid Dialogue Jumps (out-of-bounds index)
 * 5.3b: Exhaustion Lock (49th move rejected with 403)
 * 5.3c: Illegal Sleep Location (Café → sleep rejected with 403)
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { queryOLTP } from '../src/database/connection.js';
import { authRouter } from '../src/routes/auth.js';
import { playerRouter } from '../src/routes/player.js';
import { dialogueRouter } from '../src/routes/dialogue.js';
import { generateToken } from '../src/middleware/auth.js';
import { closeRedis, getRedis } from '../src/database/redis.js';

const { Pool } = pg;

// ── IDs mirroring the seeded content ─────────────────────────────────────────
const APARTMENT_ID   = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const CAFE_ID        = '123e4567-e89b-12d3-a456-426614174001';
const AWAKENING_ID   = 'c9a646d3-9c61-4cd8-bc11-657ab255b1bf';
const AWAKENING_START_NODE = 'd8b5a3e1-e123-4567-89ab-cdef01234567';

// Test user — unique UUID to avoid collisions with other suites
const TEST_USER_ID = '00000000-0000-0000-0000-000000000099';

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Column may already exist
  }
}

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/player', playerRouter);
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof app.listen>;
let pool: pg.Pool;
let port: number;

function auth() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

async function get(path: string) {
  return fetch(`http://localhost:${port}${path}`, { headers: auth() });
}

async function post(path: string, body: object) {
  return fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  // Apply migrations needed for resolver columns
  await applyMigration('001_initial_schema.sql');
  await applyMigration('005_dialogue_service.sql');
  await applyMigration('017_mystery_state.sql');
  await applyMigration('028_metaplot_alignment.sql');
  await applyMigration('033_district_travel_costs.sql');

  // Seed districts table (required for coordinate-based TB calculation)
  await pool.query(
    `CREATE TABLE IF NOT EXISTS districts (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       name VARCHAR(50) NOT NULL UNIQUE,
       slug VARCHAR(50) NOT NULL UNIQUE,
       description TEXT,
       minimap_asset_url VARCHAR(500),
       x INTEGER NOT NULL,
       y INTEGER NOT NULL
     )`
  );
  await pool.query(
    `INSERT INTO districts (id, name, slug, description, x, y) VALUES
     ('d1000000-0000-0000-0000-000000000001', 'Downtown', 'downtown', 'Heart of the city.', 0, 0),
     ('d1000000-0000-0000-0000-000000000002', 'Old Town', 'old-town', 'Historic district.', 1, 0),
     ('d1000000-0000-0000-0000-000000000003', 'Commercial', 'commercial', 'Commerce hub.', 0, 1),
     ('d1000000-0000-0000-0000-000000000004', 'Industrial', 'industrial', 'Factory zone.', 1, 2)
     ON CONFLICT (name) DO NOTHING`
  );

  // Seed scenes needed for move/sleep tests
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, 'Suburban Apartment', 'Starting location', (SELECT id FROM districts WHERE name = 'Downtown'), '{"is_sleep_location": true}')
     ON CONFLICT (id) DO UPDATE SET district_id = (SELECT id FROM districts WHERE name = 'Downtown'), metadata = EXCLUDED.metadata`,
    [APARTMENT_ID]
  );
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, 'Old Town Café', 'Coffee shop', (SELECT id FROM districts WHERE name = 'Old Town'), '{}')
     ON CONFLICT (id) DO UPDATE SET district_id = (SELECT id FROM districts WHERE name = 'Old Town'), metadata = EXCLUDED.metadata`,
    [CAFE_ID]
  );

  // Seed a clean test player at the Apartment, on the Awakening start node
  await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, username = EXCLUDED.username, updated_at = NOW()`,
    [TEST_USER_ID, 'mvw-test@example.com', 'mvw_test', 'MVW Test']
  );

  // Ensure player_states row exists with starting values
  await pool.query(
    `INSERT INTO player_states (user_id, current_location_id, current_node_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, $3, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET
       time_blocks = 48, credits = 100,
       current_location_id = $2, current_node_id = $3,
       current_day = 1, updated_at = NOW()`,
    [TEST_USER_ID, APARTMENT_ID, AWAKENING_START_NODE]
  );

  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve()))
  );
  await pool.query('DELETE FROM player_dialogue_states WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await pool.end();
  await closeRedis();
});

// Helper: reset player to a known state before each anti-cheat test
async function resetPlayer(overrides: Partial<{
  location: string; timeBlocks: number; nodeId: string | null;
}> = {}) {
  const loc  = overrides.location   ?? APARTMENT_ID;
  const tb   = overrides.timeBlocks ?? 48;
  const node = 'nodeId' in overrides ? overrides.nodeId! : null;
  await pool.query(
    `UPDATE player_states SET time_blocks = $1, current_location_id = $2,
      current_node_id = $3, active_dialogue_id = NULL WHERE user_id = $4`,
    [tb, loc, node, TEST_USER_ID]
  );
  // Flush cached player state so every route reads fresh DB values
  await redis.del(`user:state:${TEST_USER_ID}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication & Onboarding
// ─────────────────────────────────────────────────────────────────────────────
describe('Authentication & Onboarding', () => {
  test('POST /auth/register creates user and returns user data', async () => {
    // Register via API to get a hashed password entry
    const reg = await post('/auth/register', {
      email: `mvw-login-${Date.now()}@example.com`,
      username: `mvw_login_${Date.now()}`,
      password: 'hunter2',
    });
    expect(reg.status).toBe(201);
    const regData = await reg.json();
    expect(regData.success).toBe(true);
    expect(regData.data.user).toBeTruthy();
    expect(regData.data.user.email).toContain('mvw-login-');
  });

  test('GET /player/state returns correct onboarding values', async () => {
    await resetPlayer({ nodeId: AWAKENING_START_NODE });

    const res  = await get('/player/state');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.userId).toBe(TEST_USER_ID);
    expect(data.data.locationId).toBe(APARTMENT_ID);
    expect(data.data.timeBlocks).toBe(48);
    expect(data.data.credits).toBe(100);
    expect(data.data.currentNodeId).toBe(AWAKENING_START_NODE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dialogue Traversal
// ─────────────────────────────────────────────────────────────────────────────
describe('Dialogue Traversal', () => {
  let dialogueId: string;

  test('POST /dialogue/:id/choose advances node and returns correct next node', async () => {
    // Prime the user to be mid-dialogue
    await resetPlayer({ nodeId: AWAKENING_START_NODE });
    await pool.query(
      `UPDATE player_states SET active_dialogue_id = $1 WHERE user_id = $2`,
      [AWAKENING_ID, TEST_USER_ID]
    );
    await pool.query(
      `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
       VALUES ($1, $2, $3, '[]')
       ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
         current_node_id = $3, choices_made = '[]', started_at = NOW()`,
      [TEST_USER_ID, AWAKENING_ID, AWAKENING_START_NODE]
    );
    dialogueId = AWAKENING_ID;

    const res  = await post(`/dialogue/${dialogueId}/choose`, { choiceIndex: 0 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.dialogue_id).toBe(dialogueId);
    expect(data.data.choice_index).toBe(0);
    expect(data.data.next_node.id).toBeTruthy();
    // The Awakening's first choices both lead to is_end nodes
    expect(data.data.is_end).toBe(true);
  });

  test('current_node_id is NULL in DB after is_end node', async () => {
    const row = await pool.query(
      'SELECT current_node_id FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );
    expect(row.rows[0].current_node_id).toBeNull();
  });

  test('GET /player/state reflects null currentNodeId after dialogue ends', async () => {
    // Flush the player-state cache using the exact key the route uses
  await getRedis().del(`user:state:${TEST_USER_ID}`);
    // Also flush user-scoped location caches that may hold stale node data
    const keys = await getRedis().keys(`user:*:${TEST_USER_ID}:*`);
    if (keys.length) await getRedis().del(...keys);

    const res  = await get('/player/state');
    const data = await res.json();
    expect(data.data.currentNodeId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// State-Sync & Cache Invalidation
// ─────────────────────────────────────────────────────────────────────────────
describe('State-Sync & Cache Invalidation', () => {
  test('GET /player/state returns stale-free data after a move', async () => {
    await resetPlayer({ location: APARTMENT_ID, timeBlocks: 48 });

    // First call — primes Redis with Apartment state
    const before = await (await get('/player/state')).json();
    expect(before.data.locationId).toBe(APARTMENT_ID);

    // Move to Café — route must invalidate user:state:{userId} cache
    const move = await post('/player/move', { target_location_id: CAFE_ID });
    expect(move.status).toBe(200);

    // Second GET must bypass stale cache and return fresh DB values
    const after = await (await get('/player/state')).json();
    expect(after.data.locationId).toBe(CAFE_ID);
    expect(after.data.timeBlocks).toBe(47);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid Dialogue Jumps
// ─────────────────────────────────────────────────────────────────────────────
describe(' Invalid Dialogue Jumps', () => {
  beforeAll(async () => {
    await resetPlayer({ nodeId: AWAKENING_START_NODE });
    await pool.query(
      `UPDATE player_states SET active_dialogue_id = $1 WHERE user_id = $2`,
      [AWAKENING_ID, TEST_USER_ID]
    );
    await pool.query(
      `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
       VALUES ($1, $2, $3, '[]')
       ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
         current_node_id = $3, choices_made = '[]', started_at = NOW()`,
      [TEST_USER_ID, AWAKENING_ID, AWAKENING_START_NODE]
    );
  });

  test('Out-of-bounds choiceIndex returns 400 and does not mutate DB', async () => {
    const nodeIdBefore = (
      await pool.query('SELECT current_node_id FROM player_states WHERE user_id = $1', [TEST_USER_ID])
    ).rows[0].current_node_id;

    const res  = await post(`/dialogue/${AWAKENING_ID}/choose`, { choiceIndex: 999 });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);

    const nodeIdAfter = (
      await pool.query('SELECT current_node_id FROM player_states WHERE user_id = $1', [TEST_USER_ID])
    ).rows[0].current_node_id;

    // DB state must be unchanged
    expect(nodeIdAfter).toBe(nodeIdBefore);
  });

  test('Negative choiceIndex returns 400', async () => {
    const res = await post(`/dialogue/${AWAKENING_ID}/choose`, { choiceIndex: -1 });
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exhaustion Lock (49th move blocked)
// ─────────────────────────────────────────────────────────────────────────────
describe(' Exhaustion Lock (49th move blocked)', () => {
  test('Move is rejected with 403 when time_blocks = 0', async () => {
    await resetPlayer({ timeBlocks: 0 });

    const res  = await post('/player/move', { target_location_id: CAFE_ID });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('exhausted');
  });

  test('Exhausted move does not decrement time_blocks below 0', async () => {
    await resetPlayer({ timeBlocks: 0 });
    await post('/player/move', { target_location_id: CAFE_ID });

    const row = await pool.query('SELECT time_blocks FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
    expect(row.rows[0].time_blocks).toBe(0);
  });

  test('Iterative drain: 48th move succeeds, simulated 49th blocked', async () => {
    // Set to exactly 1 TB remaining
    await resetPlayer({ timeBlocks: 1 });

    const last = await post('/player/move', { target_location_id: CAFE_ID });
    expect(last.status).toBe(200);
    expect((await last.json()).data.time_blocks_remaining).toBe(0);

    // Now at 0 TB — next move must be rejected
    const over = await post('/player/move', { target_location_id: APARTMENT_ID });
    expect(over.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Illegal Sleep Locations
// ─────────────────────────────────────────────────────────────────────────────
describe(' Illegal Sleep Locations', () => {
  test('Sleep at Café returns 403', async () => {
    await resetPlayer({ location: CAFE_ID });

    const res  = await post('/player/sleep', {});
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/cannot sleep here/i);
  });

  test('DB state is unchanged after rejected sleep', async () => {
    await resetPlayer({ location: CAFE_ID, timeBlocks: 10 });
    await post('/player/sleep', {});

    const row = await pool.query(
      'SELECT current_location_id, time_blocks FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );
    expect(row.rows[0].current_location_id).toBe(CAFE_ID);
    expect(row.rows[0].time_blocks).toBe(10);
  });

  test('Sleep at Apartment succeeds (control case)', async () => {
    await resetPlayer({ location: APARTMENT_ID });

    const res  = await post('/player/sleep', {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.time_blocks).toBe(48);
    expect(data.data.current_day).toBe(2);
  });
});
