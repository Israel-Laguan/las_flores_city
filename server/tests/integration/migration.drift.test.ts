import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import pg from 'pg';
import { migrateContent, extractContentIds } from '../../src/content/migrate.js';

const { Pool } = pg;

// Dedicated test UUID — matches content/mysteries/mystery_old_town_leak.yaml; cleaned up in afterAll.
const MYSTERY_ID = 'a0000000-e29b-41d4-a716-446655440001';
const MYSTERY_FILE = 'mysteries/mystery_old_town_leak.yaml';
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
  } catch {
    // Column may already exist
  }
}

describe('Migration drift guard', () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
    // Apply migrations needed for vault_items columns
    await applyMigration('017_mystery_state.sql');
    await applyMigration('018_vault_system.sql');
    await applyMigration('026_vault_signed_urls.sql');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('extractContentIds parses multi-entity YAML shapes', () => {
    expect(
      extractContentIds('mystery', {
        mysteries: [{ id: MYSTERY_ID }],
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
      [MYSTERY_FILE, `%${MYSTERY_FILE}`]
    );

    if (logBefore.rows.length === 0) {
      await pool.query(
        `INSERT INTO migration_log (file_path, file_checksum, content_type, content_id)
         VALUES ($1, $2, 'mystery', $3)`,
        [MYSTERY_FILE, 'drift-test-bogus-checksum', MYSTERY_ID]
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
    expect(restored.rows[0].title).toBe('The Old Town Leak');
    expect(restored.rows[0].status).toBe('ACTIVE');

    const vaultItem = await pool.query(
      'SELECT mystery_id FROM vault_items WHERE id = $1',
      ['b0000000-e29b-41d4-a716-446655440001']
    );
    expect(vaultItem.rows[0]?.mystery_id).toBe(MYSTERY_ID);

    const drift = await pool.query(
      `SELECT ml.file_path FROM migration_log ml
       LEFT JOIN mysteries m ON ml.content_id = m.id
       WHERE ml.content_type = 'mystery' AND m.id IS NULL`
    );
    expect(drift.rows).toHaveLength(0);
  });
});
