import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Pool } = pg;

describe('Database Constraints', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Cannot insert two users with the same email', async () => {
    const uniqueEmail = `test-${Date.now()}@example.com`;

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      ['00000000-0000-0000-0000-000000000020', uniqueEmail, 'testuser1', 'Test User 1']
    );

    await expect(
      pool.query(
        'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
        ['00000000-0000-0000-0000-000000000021', uniqueEmail, 'testuser2', 'Test User 2']
      )
    ).rejects.toThrow();

    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
      '00000000-0000-0000-0000-000000000020',
      '00000000-0000-0000-0000-000000000021',
    ]);
  });

  test('Cannot insert two users with the same username', async () => {
    const uniqueUsername = `uniqueuser_${Date.now()}`;

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      ['00000000-0000-0000-0000-000000000022', 'email1@test.com', uniqueUsername, 'User 1']
    );

    await expect(
      pool.query(
        'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
        ['00000000-0000-0000-0000-000000000023', 'email2@test.com', uniqueUsername, 'User 2']
      )
    ).rejects.toThrow();

    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
      '00000000-0000-0000-0000-000000000022',
      '00000000-0000-0000-0000-000000000023',
    ]);
  });

  test('Time blocks cannot exceed max_blocks', async () => {
    const userId = '00000000-0000-0000-0000-000000000030';

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      [userId, `tb-test-${Date.now()}@test.com`, `tbtest_${Date.now()}`, 'TB Test']
    );

    await pool.query(
      'INSERT INTO time_blocks (id, user_id, current_blocks, max_blocks) VALUES ($1, $2, $3, $4)',
      [`00000000-0000-0000-0000-000000000031`, userId, 12, 12]
    );

    await expect(
      pool.query(
        'INSERT INTO time_blocks (id, user_id, current_blocks, max_blocks) VALUES ($1, $2, $3, $4)',
        [`00000000-0000-0000-0000-000000000032`, userId, 25, 24]
      )
    ).rejects.toThrow();

    await pool.query('DELETE FROM time_blocks WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  test('Time blocks current_blocks cannot be negative', async () => {
    const userId = '00000000-0000-0000-0000-000000000033';

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      [userId, `neg-test-${Date.now()}@test.com`, `negtest_${Date.now()}`, 'Neg Test']
    );

    await expect(
      pool.query(
        'INSERT INTO time_blocks (id, user_id, current_blocks, max_blocks) VALUES ($1, $2, $3, $4)',
        [`00000000-0000-0000-0000-000000000034`, userId, -1, 12]
      )
    ).rejects.toThrow();

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  test('Dialogue overlay references valid dialogue tree', async () => {
    const treeId = '00000000-0000-0000-0000-000000000040';

    await pool.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes) VALUES ($1, $2, $3, $4)`,
      [treeId, 'Test Tree', '{}', '{}']
    );

    await pool.query(
      `INSERT INTO dialogue_overlays (id, name, target_tree_id, modifications) VALUES ($1, $2, $3, $4)`,
      ['00000000-0000-0000-0000-000000000041', 'Test Overlay', treeId, '[]']
    );

    const result = await pool.query(
      'SELECT COUNT(*) AS count FROM dialogue_overlays WHERE target_tree_id = $1',
      [treeId]
    );
    expect(Number(result.rows[0].count)).toBe(1);

    await pool.query('DELETE FROM dialogue_overlays WHERE id = $1', ['00000000-0000-0000-0000-000000000041']);
    await pool.query('DELETE FROM dialogue_trees WHERE id = $1', [treeId]);
  });

  test('Player state references valid user', async () => {
    const userId = '00000000-0000-0000-0000-000000000050';

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      [userId, `ps-test-${Date.now()}@test.com`, `pstest_${Date.now()}`, 'PS Test']
    );

    await pool.query(
      'INSERT INTO player_states (id, user_id, flags) VALUES ($1, $2, $3)',
      ['00000000-0000-0000-0000-000000000051', userId, '{}']
    );

    const result = await pool.query(
      'SELECT COUNT(*) AS count FROM player_states WHERE user_id = $1',
      [userId]
    );
    expect(Number(result.rows[0].count)).toBe(1);

    await pool.query('DELETE FROM player_states WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  test('User cannot have multiple time_blocks entries', async () => {
    const userId = '00000000-0000-0000-0000-000000000060';

    await pool.query(
      'INSERT INTO users (id, email, username, display_name) VALUES ($1, $2, $3, $4)',
      [userId, `dup-tb-${Date.now()}@test.com`, `duptb_${Date.now()}`, 'Dup TB']
    );

    await pool.query(
      'INSERT INTO time_blocks (id, user_id, current_blocks, max_blocks) VALUES ($1, $2, $3, $4)',
      ['00000000-0000-0000-0000-000000000061', userId, 12, 12]
    );

    await expect(
      pool.query(
        'INSERT INTO time_blocks (id, user_id, current_blocks, max_blocks) VALUES ($1, $2, $3, $4)',
        ['00000000-0000-0000-0000-000000000062', userId, 10, 12]
      )
    ).rejects.toThrow();

    await pool.query('DELETE FROM time_blocks WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });
});
