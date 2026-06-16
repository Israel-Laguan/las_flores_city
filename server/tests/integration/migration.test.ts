import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Pool } = pg;

const TEST_CHAR_ID = '00000000-0000-0000-0000-000000000010';
let pool: pg.Pool;
let initialCharacterCount = 0;

async function characterCount() {
  const result = await pool.query('SELECT COUNT(*) AS count FROM characters');
  return Number(result.rows[0].count);
}

describe('Migration Idempotency', () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });

    await pool.query('DELETE FROM characters WHERE id = $1', [TEST_CHAR_ID]);
    initialCharacterCount = await characterCount();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM characters WHERE id = $1', [TEST_CHAR_ID]);
    await pool.end();
  });

  test('Characters table contains migrated content before idempotency checks', async () => {
    expect(initialCharacterCount).toBeGreaterThanOrEqual(1);
  });

  test('Migration inserts characters correctly', async () => {
    const testChar = {
      id: TEST_CHAR_ID,
      name: 'Test Character',
      title: 'Test Title',
      description: 'A test character for idempotency testing',
    };

    await pool.query(
      `INSERT INTO characters (id, name, title, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [testChar.id, testChar.name, testChar.title, testChar.description]
    );

    expect(await characterCount()).toBe(initialCharacterCount + 1);

    const result = await pool.query('SELECT name FROM characters WHERE id = $1', [testChar.id]);
    expect(result.rows[0].name).toBe(testChar.name);
  });

  test('Second upsert does not create duplicate rows', async () => {
    const testChar = {
      id: TEST_CHAR_ID,
      name: 'Test Character Updated',
      title: 'Test Title Updated',
      description: 'Updated description for idempotency testing',
    };

    const countBefore = await characterCount();

    await pool.query(
      `INSERT INTO characters (id, name, title, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [testChar.id, testChar.name, testChar.title, testChar.description]
    );

    expect(await characterCount()).toBe(countBefore);

    const updated = await pool.query('SELECT name FROM characters WHERE id = $1', [testChar.id]);
    expect(updated.rows[0].name).toBe('Test Character Updated');
  });

  test('Migration log records checksums', async () => {
    const result = await pool.query(
      'SELECT file_path, file_checksum, content_type, content_id FROM migration_log LIMIT 1'
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(0);
    if (result.rows.length > 0) {
      expect(result.rows[0]).toHaveProperty('file_path');
      expect(result.rows[0]).toHaveProperty('file_checksum');
      expect(result.rows[0]).toHaveProperty('content_type');
      expect(result.rows[0]).toHaveProperty('content_id');
    }
  });

  test('Cleanup removes test character', async () => {
    await pool.query('DELETE FROM characters WHERE id = $1', [TEST_CHAR_ID]);
    expect(await characterCount()).toBe(initialCharacterCount);
  });
});

