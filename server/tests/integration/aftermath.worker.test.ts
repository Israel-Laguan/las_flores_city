import fs from 'fs';
import path from 'path';
import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { closeRedis } from '../../src/database/redis.js';
import { LeaderboardWorker } from '../../src/workers/LeaderboardWorker.js';

// ============================================================
// Aftermath worker integration tests
//
// Exercises the full recycle path: when a mystery's Breakthrough
// window expires, the LeaderboardWorker reads its
// `aftermath_payload` and atomically:
//   1. Flips `vault_items.item_type` from 'clue' to 'memento'.
//   2. Deletes matching rows from `scene_characters`.
//   3. Archives the mystery.
//
// Uses dedicated synthetic UUIDs to avoid colliding with live
// data. Cleans up in afterAll.
// ============================================================

// --- Synthetic IDs (collision-avoidance per AGENTS.md) ---
const MYSTERY_ID = 'c1000000-e29b-41d4-a716-446655440099';
const CLUE_VAULT_ITEM_ID = 'c1000000-e29b-41d4-a716-4466554400a1';
const PREMIUM_CG_ITEM_ID = 'c1000000-e29b-41d4-a716-4466554400a2';
const SCENE_ID = 'c1000000-e29b-41d4-a716-4466554400b1';
const CHARACTER_ID = 'c1000000-e29b-41d4-a716-4466554400c1';
const PLAYER_ID = 'c1000000-0000-4000-8000-000000000099';

const AFTERMATH_PAYLOAD = {
  retire_vault_items: [CLUE_VAULT_ITEM_ID],
  // premium_cg item deliberately NOT in the list — the worker
  // should leave it untouched.
  remove_scene_characters: [
    { scene_id: SCENE_ID, character_id: CHARACTER_ID },
  ],
};

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Column may already exist — that's fine
  }
}

describe('Aftermath Worker', () => {
  beforeAll(async () => {
    await applyMigration('017_mystery_state.sql');
    await applyMigration('018_vault_system.sql');
    await applyMigration('026_vault_signed_urls.sql');
    await applyMigration('021_leaderboards.sql');
    await applyMigration('027_aftermath.sql');
    await applyMigration('033_district_travel_costs.sql');

    // Seed districts table (required for scenes foreign key)
    await queryOLTP(
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
    await queryOLTP(
      `INSERT INTO districts (id, name, slug, description, x, y) VALUES
       ('d1000000-0000-0000-0000-000000000001', 'Downtown', 'downtown', 'Heart of the city.', 0, 0)
       ON CONFLICT (name) DO NOTHING`
    );

    // Seed a RESOLVING mystery with the aftermath payload.
    await queryOLTP(
      `INSERT INTO mysteries (id, title, description, status, expires_at, aftermath_payload)
       VALUES ($1, 'Aftermath Test Mystery', 'Worker test', 'RESOLVING', NOW() - INTERVAL '10 minutes', $2)
       ON CONFLICT (id) DO UPDATE SET
         status = 'RESOLVING',
         expires_at = NOW() - INTERVAL '10 minutes',
         aftermath_payload = $2`,
      [MYSTERY_ID, JSON.stringify(AFTERMATH_PAYLOAD)]
    );

    // Seed a clue vault item.
    await queryOLTP(
      `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type, mystery_id)
       VALUES ($1, 'Test Corrupted Drive', 'A clue item', 'https://example.com/thumb.png', '/media/drive.png', 'clue', $2)
       ON CONFLICT (id) DO UPDATE SET item_type = 'clue', mystery_id = $2`,
      [CLUE_VAULT_ITEM_ID, MYSTERY_ID]
    );

    // Seed a premium_cg item that shares the mystery — should NOT be demoted.
    await queryOLTP(
      `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type, mystery_id)
       VALUES ($1, 'Premium CG', 'Premium content', 'https://example.com/premium.png', '/media/premium.png', 'premium_cg', $2)
       ON CONFLICT (id) DO UPDATE SET item_type = 'premium_cg', mystery_id = $2`,
      [PREMIUM_CG_ITEM_ID, MYSTERY_ID]
    );

    // Seed a scene + character mapping to be scrubbed.
    // scenes is created via 001_initial_schema; scene_characters too.
    await queryOLTP(
      `INSERT INTO scenes (id, name, description, district_id)
       VALUES ($1, 'Aftermath Test Scene', 'Test', (SELECT id FROM districts WHERE name = 'Downtown'))
       ON CONFLICT (id) DO NOTHING`,
      [SCENE_ID]
    );
    await queryOLTP(
      `INSERT INTO characters (id, name, description)
       VALUES ($1, 'Temp NPC', 'Temporary test NPC')
       ON CONFLICT (id) DO NOTHING`,
      [CHARACTER_ID]
    );
    await queryOLTP(
      `INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type, is_available, is_permanent)
       VALUES ($1, $2, 50, 'acquaintance', TRUE, FALSE)
       ON CONFLICT (scene_id, character_id) DO NOTHING`,
      [SCENE_ID, CHARACTER_ID]
    );

    // Seed a player (needed for leaderboard flow, though no-solvers path also works).
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, 'aftermath@test.com', 'aftermath_player', 'Aftermath Player')
       ON CONFLICT (id) DO NOTHING`,
      [PLAYER_ID]
    );
    await queryOLTP(
      `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
       VALUES ($1, 48, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
       ON CONFLICT (user_id) DO NOTHING`,
      [PLAYER_ID]
    );
  });

  afterAll(async () => {
    try {
      await queryOLTP(`DELETE FROM scene_characters WHERE scene_id = $1`, [SCENE_ID]);
      await queryOLTP(`DELETE FROM characters WHERE id = $1`, [CHARACTER_ID]);
      await queryOLTP(`DELETE FROM scenes WHERE id = $1`, [SCENE_ID]);
      await queryOLTP(`DELETE FROM vault_items WHERE id = ANY($1::uuid[])`, [[CLUE_VAULT_ITEM_ID, PREMIUM_CG_ITEM_ID]]);
      await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [PLAYER_ID]);
      await queryOLTP(`DELETE FROM users WHERE id = $1`, [PLAYER_ID]);
      await queryOLTP(`DELETE FROM leaderboards WHERE mystery_id = $1`, [MYSTERY_ID]);
      await queryOLTP(`DELETE FROM player_mysteries WHERE mystery_id = $1`, [MYSTERY_ID]);
      await queryOLTP(`DELETE FROM mysteries WHERE id = $1`, [MYSTERY_ID]);
    } catch (err) {
      console.error('aftermath.worker cleanup error:', err);
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  test('Worker demotes clue items to mementos and scrubs characters', async () => {
    // The mystery has no solvers, so the worker takes the no-solvers
    // path (getSolvers returns []).
    await LeaderboardWorker.processExpiredMysteries();

    // 1. Clue item should now be a memento.
    const { rows: clueRows } = await queryOLTP<{ item_type: string }>(
      `SELECT item_type FROM vault_items WHERE id = $1`,
      [CLUE_VAULT_ITEM_ID]
    );
    expect(clueRows).toHaveLength(1);
    expect(clueRows[0].item_type).toBe('memento');

    // 2. Premium CG item should remain untouched.
    const { rows: premiumRows } = await queryOLTP<{ item_type: string }>(
      `SELECT item_type FROM vault_items WHERE id = $1`,
      [PREMIUM_CG_ITEM_ID]
    );
    expect(premiumRows).toHaveLength(1);
    expect(premiumRows[0].item_type).toBe('premium_cg');

    // 3. Scene character mapping should be deleted.
    const { rows: scRows } = await queryOLTP(
      `SELECT 1 FROM scene_characters WHERE scene_id = $1 AND character_id = $2`,
      [SCENE_ID, CHARACTER_ID]
    );
    expect(scRows).toHaveLength(0);

    // 4. Mystery should be ARCHIVED.
    const { rows: mysteryRows } = await queryOLTP<{ status: string }>(
      `SELECT status FROM mysteries WHERE id = $1`,
      [MYSTERY_ID]
    );
    expect(mysteryRows[0].status).toBe('ARCHIVED');
  });

  test('Idempotent: running worker again is a safe no-op', async () => {
    // The mystery is already ARCHIVED, so processExpiredMysteries
    // skips it entirely (WHERE status = 'RESOLVING').
    await LeaderboardWorker.processExpiredMysteries();

    // Clue item should still be memento (UPDATE is idempotent
    // but the worker never reaches applyAftermath on ARCHIVED).
    const { rows } = await queryOLTP<{ item_type: string }>(
      `SELECT item_type FROM vault_items WHERE id = $1`,
      [CLUE_VAULT_ITEM_ID]
    );
    expect(rows[0].item_type).toBe('memento');
  });
});
