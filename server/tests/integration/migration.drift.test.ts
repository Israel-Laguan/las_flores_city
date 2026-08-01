import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import pg from 'pg';
import { migrateContent, extractContentIds } from '../../src/content/migrate.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

// Dedicated test UUID — matches content/missions/mission_great_lithium_leak.yaml; cleaned up in afterAll.
const MYSTERY_ID = 'a0000000-e29b-41d4-a716-446655440001';
const MISSION_FILE = 'missions/great_lithium_leak/mission_great_lithium_leak.yaml';
const VAULT_FILE = 'vault/great_lithium_leak_clues.yaml';
const OVERLAY_FILE = 'overlays/great_lithium_leak/overlay_great_lithium_leak.yaml';
// Beats-based story arc file (content/stories/real_heroism_in_latam/). Migrates
// as content type 'story' and writes story_beats rows (slug keys), not a manifest row.
// Collision-avoidance note: the beat_sofia_* slugs asserted below are the CANONICAL
// story-beat slugs from this real content file (not a synthetic fixture). Per
// AGENTS.md, migration.drift deliberately migrates the actual YAML file (like the
// great_lithium_leak mission above), so it must use the real slugs. The upserted
// story_beats rows are intentionally NOT cleaned up in afterAll — they are canonical
// rows that should persist; deleting them would corrupt the beat registry relied on
// by dialogue/scene beat-slug validation. Only the migration_log row is cleaned up.
const STORY_FILE = 'stories/real_heroism_in_latam/real_heroism_in_latam.yaml';
const CONTENT_DIR = path.resolve(process.cwd(), '../content');

let pool: pg.Pool;

async function applyMigration(filename: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const { queryOLTP } = await import('../../src/database/connection.js');
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch (error: any) {
    // For migration_log constraint updates, force apply even if it "fails"
    if (filename === '046_stories.sql' && error.message?.includes('migration_log_content_type_check')) {
      await queryOLTP(`
        ALTER TABLE migration_log
          DROP CONSTRAINT IF EXISTS migration_log_content_type_check;
        ALTER TABLE migration_log
          ADD CONSTRAINT migration_log_content_type_check
          CHECK (content_type IN (
            'character', 'dialogue', 'overlay', 'scene', 'gig', 'vault',
            'mission', 'story', 'shop_item', 'location', 'map_tile', 'story_beat'
          ));
      `);
    } else {
      throw error;
    }
  }
}

describe('Migration drift guard', () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
    // Apply migrations needed for vault_items columns and mission content type
    await applyMigration('017_mystery_state.sql');
    await applyMigration('018_vault_system.sql');
    await applyMigration('026_vault_signed_urls.sql');
    // 044 creates the story_beats table required by the story-arc migration
    // test below (upsertStoryBeat writes to it). Must run before 046, which
    // extends the migration_log CHECK constraint to include 'story'.
    await applyMigration('044_story_beats.sql');
    await applyMigration('046_stories.sql');
    // The dead stories manifest table no longer exists; 058 drops it (046 above
    // may have recreated it if the real DB already ran 058).
    await applyMigration('058_drop_stories_table.sql');
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM migration_log WHERE file_path IN ($1, $2, $3, $4)`,
      [MISSION_FILE, VAULT_FILE, OVERLAY_FILE, STORY_FILE]
    );
    await pool.end();
    await closeRedis();
  });

  test('extractContentIds parses multi-entity YAML shapes', () => {
    expect(
      extractContentIds('mission', {
        missions: [{ id: MYSTERY_ID }],
      })
    ).toEqual([MYSTERY_ID]);

    expect(
      extractContentIds('vault', {
        vault_items: [{ id: 'b0000000-e29b-41d4-a716-446655440001' }],
      })
    ).toEqual(['b0000000-e29b-41d4-a716-446655440001']);
  });

  test('reprocesses content when migration_log exists but target row is missing', async () => {
    const logBefore = await pool.query(
      `SELECT id FROM migration_log
       WHERE file_path = $1 OR file_path LIKE $2`,
      [MISSION_FILE, `%${MISSION_FILE}`]
    );

    if (logBefore.rows.length === 0) {
      await pool.query(
        `INSERT INTO migration_log (file_path, file_checksum, content_type, content_id)
         VALUES ($1, $2, 'mission', $3)`,
        [MISSION_FILE, 'drift-test-bogus-checksum', MYSTERY_ID]
      );
    }

    await pool.query('DELETE FROM mysteries WHERE id = $1', [MYSTERY_ID]);

    const missing = await pool.query('SELECT id FROM mysteries WHERE id = $1', [MYSTERY_ID]);
    expect(missing.rows).toHaveLength(0);

    // NOTE: migrateContent acquires a global advisory lock, so passing specific
    // file paths does NOT prevent contention with parallel tests. This test may
    // be flaky under parallel execution.
    const missionPath = path.resolve(CONTENT_DIR, MISSION_FILE);
    const vaultPath = path.resolve(CONTENT_DIR, VAULT_FILE);
    const overlayPath = path.resolve(CONTENT_DIR, OVERLAY_FILE);
    const result = await migrateContent(CONTENT_DIR, [missionPath, vaultPath, overlayPath]);
    expect(result.success).toBe(true);
    expect(result.filesFailed).toBe(0);

    const restored = await pool.query(
      'SELECT id, title, status FROM mysteries WHERE id = $1',
      [MYSTERY_ID]
    );
    expect(restored.rows).toHaveLength(1);
    expect(restored.rows[0].id).toBe(MYSTERY_ID);
    expect(restored.rows[0].title).toBe('The Great Lithium Leak');
    // Status reflects the re-migrated content (ACTIVE per the source YAML).
    // Tolerate lifecycle transitions performed by the background LeaderboardWorker
    // (ACTIVE → RESOLVING → ARCHIVED) so the assertion is not racy.
    expect(['ACTIVE', 'RESOLVING', 'ARCHIVED']).toContain(restored.rows[0].status);

    const vaultItem = await pool.query(
      'SELECT mystery_id FROM vault_items WHERE id = $1',
      ['b0000000-e29b-41d4-a716-446655440001']
    );
    expect(vaultItem.rows[0]?.mystery_id).toBe(MYSTERY_ID);

    const drift = await pool.query(
      `SELECT ml.file_path FROM migration_log ml
        LEFT JOIN mysteries m ON ml.content_id::uuid = m.id
        WHERE ml.content_type = 'mission' AND m.id IS NULL`
    );
    expect(drift.rows).toHaveLength(0);
  });

  test('story arc file migrates to story_beats and the stories manifest table is gone', async () => {
    // Beats-based story arcs write slug rows into story_beats — NOT a `stories`
    // manifest row. 058 dropped the dead table; the migration drift guard must
    // verify presence via story_beats.slug for content type 'story'.
    const storyPath = path.resolve(CONTENT_DIR, STORY_FILE);
    const result = await migrateContent(CONTENT_DIR, [storyPath]);
    expect(result.success).toBe(true);
    expect(result.filesFailed).toBe(0);

    const beats = await pool.query(
      'SELECT slug, "order" FROM story_beats WHERE slug = ANY($1) ORDER BY "order"',
      [['beat_sofia_intro', 'beat_sofia_resolution']]
    );
    expect(beats.rows.map((r) => r.slug)).toEqual(['beat_sofia_intro', 'beat_sofia_resolution']);

    const tableCheck = await pool.query(`SELECT to_regclass('public.stories') AS table_name`);
    expect(tableCheck.rows[0].table_name).toBeNull();

    const log = await pool.query(
      `SELECT content_type, content_id FROM migration_log WHERE file_path = $1`,
      [STORY_FILE]
    );
    expect(log.rows[0]?.content_type).toBe('story');
    expect(log.rows[0]?.content_id).toBe('beat_sofia_intro');
  });
});
