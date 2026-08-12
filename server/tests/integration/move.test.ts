import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { playerRouter } from '../../src/routes/player.js';
import { locationRouter } from '../../src/routes/location.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '@las-flores/infra';

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000010';
// These are real content scenes (Apartment, Welcome Center, Cafe). Per the
// integration-test guideline we normally use dedicated synthetic UUIDs, but
// these tests depend on existing player_states referencing them (see seedTestData).
// The accepted exception is documented here; a follow-up should create synthetic
// scene/player_state fixtures to remove this drift.
const APARTMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const WELCOME_CENTER_ID = '550e8400-e29b-41d4-a716-446655440002';
const CAFE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
const NONEXISTENT_ID = '00000000-0000-0000-0000-999999999999';

const app = express();
app.use(express.json());
app.use('/player', playerRouter);
app.use('/location', locationRouter);

let server: any;
let pool: pg.Pool;

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await withSchemaLock(async (client) => {
      await client.query(sql);
    });
  } catch (err: any) {
    if (err.code === '42P07' || err.code === '42701') {
      console.warn(`applyMigration(${filename}) ignored idempotent error:`, err.message);
      return;
    }
    throw err;
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

let DOWNTOWN_ID: string;
let OLD_TOWN_ID: string;

// Captured in beforeAll (before seedTestData hijacks real content scenes) so
// afterAll can restore their original district_id instead of deleting them.
const originalSceneDistricts = new Map<string, string>();

// Seed the districts, scenes, user, and player_state rows these tests rely on.
// Other test files run migrations that may drop/recreate the scenes table, so
// this is idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT) and is invoked
// from both beforeAll and beforeEach. The district travel-cost migration is
// idempotent as well, so re-applying it per-test is safe.
async function seedTestData(): Promise<void> {
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
     -- Synthetic UUIDs reserved for this test — cleaned up in afterAll, no collision with other tests.
     ('d1000000-0000-0000-0000-000000000001', 'test-district-alpha', 'test-district-alpha', 'Test district alpha.', 0, 0),
     ('d1000000-0000-0000-0000-000000000002', 'test-district-beta', 'test-district-beta', 'Test district beta.', 1, 0),
     ('d1000000-0000-0000-0000-000000000003', 'test-district-gamma', 'test-district-gamma', 'Test district gamma.', 0, 1),
     ('d1000000-0000-0000-0000-000000000004', 'test-district-delta', 'test-district-delta', 'Test district delta.', 1, 2)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       slug = EXCLUDED.slug,
       description = EXCLUDED.description,
       x = EXCLUDED.x,
       y = EXCLUDED.y`
  );

  await applyMigration('033_district_travel_costs.sql');

  // Use the synthetic UUIDs for test-owned districts.
  const alphaQ = await pool.query<{ id: string }>(
    "SELECT id FROM districts WHERE name = 'test-district-alpha'"
  );
  DOWNTOWN_ID = alphaQ.rows[0].id;
  const betaQ = await pool.query<{ id: string }>(
    "SELECT id FROM districts WHERE name = 'test-district-beta'"
  );
  OLD_TOWN_ID = betaQ.rows[0].id;

  // Insert scenes with valid district_ids
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, $2, $3, $4, '{"type": "starting_location", "accessible": true, "is_sleep_location": true}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       district_id = EXCLUDED.district_id, metadata = EXCLUDED.metadata`,
    [APARTMENT_ID, 'The Apartment', 'Test apartment location', DOWNTOWN_ID]
  );
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, $2, $3, $4, '{"type": "starting_location", "accessible": true}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       district_id = EXCLUDED.district_id, metadata = EXCLUDED.metadata`,
    [WELCOME_CENTER_ID, 'Welcome Center', 'Test welcome center location', DOWNTOWN_ID]
  );
  await pool.query(
    `INSERT INTO scenes (id, name, description, district_id, metadata)
     VALUES ($1, $2, $3, $4, '{"type": "location", "accessible": true}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       district_id = EXCLUDED.district_id, metadata = EXCLUDED.metadata`,
    [CAFE_ID, 'The Cafe', 'Test cafe location', OLD_TOWN_ID]
  );

  // Ensure user and player_state exist
  await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       updated_at = NOW()`,
    [TEST_USER_ID, 'move-test@example.com', 'move_test', 'Move Test']
  );
  await pool.query(
    `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET
       time_blocks = 48,
       current_location_id = $2,
       updated_at = NOW()`,
    [TEST_USER_ID, APARTMENT_ID]
  );
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  // Capture the original district_id of any pre-existing real content scenes
  // BEFORE seedTestData hijacks them (repoints district_id at synthetic test
  // districts). afterAll restores these so real content is not corrupted.
  const preTestScenes = await pool.query(
    'SELECT id, district_id FROM scenes WHERE id = ANY($1::uuid[])',
    [[APARTMENT_ID, WELCOME_CENTER_ID, CAFE_ID]],
  );
  for (const row of preTestScenes.rows) {
    originalSceneDistricts.set(row.id, row.district_id);
  }

  await seedTestData();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
  await pool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);

  // The test hijacks real content scenes (e.g. the Welcome Center) by repointing
  // their district_id at synthetic test districts. We cannot delete those real
  // scenes — other players' player_states reference them — so restore their
  // original district_id. Scenes that did not exist before the test (purely
  // synthetic) are safe to delete.
  for (const [sceneId, originalDistrictId] of originalSceneDistricts) {
    await pool.query(
      'UPDATE scenes SET district_id = $1 WHERE id = $2',
      [originalDistrictId, sceneId],
    );
  }
  const syntheticSceneIds = [APARTMENT_ID, WELCOME_CENTER_ID, CAFE_ID].filter(
    id => !originalSceneDistricts.has(id),
  );
  if (syntheticSceneIds.length > 0) {
    await pool.query(
      `DELETE FROM scenes WHERE id = ANY($1::uuid[])`,
      [syntheticSceneIds],
    );
  }

  await pool.query(
    'DELETE FROM districts WHERE id = ANY($1::uuid[])',
    [['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004']]
  );
  await pool.end();
  await closeRedis();
});

beforeEach(async () => {
  // Re-seed in case other test files ran migrations that dropped/recreated the
  // scenes table between tests. seedTestData is idempotent.
  await seedTestData();
});

describe('POST /player/move', () => {
  test('moves player to a new location and deducts TB based on district distance', async () => {
    // Apartment (Downtown) → Welcome Center (Downtown): same district = 0 TB
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: WELCOME_CENTER_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('from_location_id', APARTMENT_ID);
    expect(data.data).toHaveProperty('to_location_id', WELCOME_CENTER_ID);
    // Downtown → Downtown = 0 TB
    expect(data.data).toHaveProperty('tb_cost', 0);
    expect(data.data).toHaveProperty('time_blocks_remaining', 48);
    expect(data.data).toHaveProperty('scene');
    expect(data.data.scene).toHaveProperty('id', WELCOME_CENTER_ID);
    expect(data.data).toHaveProperty('npcs');
    expect(Array.isArray(data.data.npcs)).toBe(true);
  });

  test('returns 400 when target_location_id is missing', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toHaveProperty('success', false);
    expect(data.error).toContain('target_location_id is required');
  });

  test('returns 404 for non-existent location', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: NONEXISTENT_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toHaveProperty('success', false);
    expect(data.error).toBe('Location not found');
  });

  test('returns 400 when already at the target location', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: APARTMENT_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toHaveProperty('success', false);
    expect(data.error).toContain('already at this location');
  });

  test('returns 403 when player has 0 time blocks and moving to another district', async () => {
    await pool.query(
      'UPDATE player_states SET time_blocks = 0 WHERE user_id = $1',
      [TEST_USER_ID]
    );

    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: CAFE_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toHaveProperty('success', false);
    expect(data.error).toBe('exhausted');
    expect(data.reason).toContain('exhausted');
  });

  test('deducts correct TB per move based on district distance', async () => {
    const port = server.address().port;

    // Apartment (Downtown) → Welcome Center (Downtown): same district = 0 TB
    const move1 = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: WELCOME_CENTER_ID }),
    });
    const data1 = await move1.json();
    expect(data1.data.time_blocks_remaining).toBe(48);

    // Welcome Center (Downtown) → Cafe (Old Town): different district = 1 TB
    const move2 = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: CAFE_ID }),
    });
    const data2 = await move2.json();
    expect(data2.data.time_blocks_remaining).toBe(47);
  });

  test('emits move event to OLAP after successful move', async () => {
    const port = server.address().port;

    const analyticsPool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
      connectionTimeoutMillis: 5000,
    });

    try {
      await analyticsPool.query('DELETE FROM player_events WHERE user_id = $1', [TEST_USER_ID]);

      await fetch(`http://localhost:${port}/player/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ target_location_id: WELCOME_CENTER_ID }),
      });

      const result = await analyticsPool.query(
        `SELECT event_type, event_data, time_blocks_cost
         FROM player_events
         WHERE user_id = $1 AND event_type = 'move'
         ORDER BY created_at DESC LIMIT 1`,
        [TEST_USER_ID]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].time_blocks_cost).toBe(0);

      const eventData = result.rows[0].event_data;
      expect(eventData).toHaveProperty('from_location_id', APARTMENT_ID);
      expect(eventData).toHaveProperty('to_location_id', WELCOME_CENTER_ID);
    } finally {
      await analyticsPool.query('DELETE FROM player_events WHERE user_id = $1', [TEST_USER_ID]);
      await analyticsPool.end();
    }
  });

  test('does not deduct TB when move fails (exhausted)', async () => {
    await pool.query(
      'UPDATE player_states SET time_blocks = 0 WHERE user_id = $1',
      [TEST_USER_ID]
    );

    const port = server.address().port;
    await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target_location_id: CAFE_ID }),
    });

    const stateResult = await pool.query(
      'SELECT time_blocks FROM player_states WHERE user_id = $1',
      [TEST_USER_ID]
    );
    expect(stateResult.rows[0].time_blocks).toBe(0);
  });

  test('returns 401 without auth token', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/player/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_location_id: WELCOME_CENTER_ID }),
    });

    expect(res.status).toBe(401);
  });
});
