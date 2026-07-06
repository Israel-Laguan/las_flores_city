import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import pg from 'pg';
import { migrateContent, extractContentIds } from '../../src/content/migrate.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

// Dedicated test UUID — matches content/missions/mission_great_lithium_leak.yaml; cleaned up in afterAll.
const MYSTERY_ID = 'a0000000-e29b-41d4-a716-446655440001';
const MISSION_FILE = 'missions/mission_great_lithium_leak.yaml';
const VAULT_FILE = 'vault/great_lithium_leak_clues.yaml';
const OVERLAY_FILE = 'overlays/overlay_great_lithium_leak.yaml';
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
    await applyMigration('046_stories.sql');
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM migration_log WHERE file_path IN ($1, $2, $3)`,
      [MISSION_FILE, VAULT_FILE, OVERLAY_FILE]
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

    const result = await migrateContent(CONTENT_DIR);
    expect(result.success).toBe(true);
    expect(result.filesFailed).toBe(0);

    const restored = await pool.query(
      'SELECT id, title, status FROM mysteries WHERE id = $1',
      [MYSTERY_ID]
    );
    expect(restored.rows).toHaveLength(1);
    expect(restored.rows[0].title).toBe('The Great Lithium Leak');
    expect(restored.rows[0].status).toBe('ACTIVE');

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
});
