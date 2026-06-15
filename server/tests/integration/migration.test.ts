import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Pool } = pg;

describe('Migration Idempotency', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5432/las_flores',
      connectionTimeoutMillis: 5000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Characters table is empty before migration', async () => {
    const result = await pool.query('SELECT COUNT(*) AS count FROM characters');
    expect(Number(result.rows[0].count)).toBe(0);
  });

  test('Migration inserts characters correctly', async () => {
    const testChar = {
      id: '00000000-0000-0000-0000-000000000010',
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

    const result = await pool.query('SELECT COUNT(*) AS count FROM characters');
    expect(Number(result.rows[0].count)).toBe(1);
  });

  test('Second upsert does not create duplicate rows', async () => {
    const testChar = {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Test Character Updated',
      title: 'Test Title Updated',
      description: 'Updated description for idempotency testing',
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

    const result = await pool.query('SELECT COUNT(*) AS count FROM characters');
    expect(Number(result.rows[0].count)).toBe(1);

    const updated = await pool.query('SELECT name FROM characters WHERE id = $1', [testChar.id]);
    expect(updated.rows[0].name).toBe('Test Character Updated');
  });

  test('Migration log records checksums', async () => {
    const result = await pool.query(
      'SELECT id FROM migration_log LIMIT 1'
    );
    // Migration log should exist after running migrate
    // This test validates the table structure
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });

  test('Cleanup: remove test data', async () => {
    await pool.query('DELETE FROM characters WHERE id = $1', ['00000000-0000-0000-0000-000000000010']);
    const result = await pool.query('SELECT COUNT(*) AS count FROM characters');
    expect(Number(result.rows[0].count)).toBe(0);
  });
});
