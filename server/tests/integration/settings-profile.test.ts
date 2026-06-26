import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { settingsRouter } from '../../src/routes/settings.js';
import { authRouter } from '../../src/routes/auth.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-0000000aa200';
const TEST_DEV_USER_ID = '00000000-0000-0000-0000-0000000aa201';
const TEST_USER_EMAIL = 'settings-profile-test@example.com';
const TEST_USER_USERNAME = 'settings_profile_test';
const TEST_DEV_EMAIL = 'settings-profile-dev@example.com';
const TEST_DEV_USERNAME = 'settings_profile_dev';
const TEST_PASSWORD = 'TestPass123!';
const TEST_DISPLAY_NAME = 'Original Name';

const app = express();
app.use(express.json());
app.use('/settings', settingsRouter);
app.use('/auth', authRouter);

let server: any;
let pool: pg.Pool;

function authHeaders(userId = TEST_USER_ID) {
  return { Authorization: `Bearer ${generateToken(userId)}`, 'Content-Type': 'application/json' };
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  await pool.query('DELETE FROM player_states WHERE user_id IN ($1, $2)', [TEST_USER_ID, TEST_DEV_USER_ID]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [TEST_USER_ID, TEST_DEV_USER_ID]);
  await pool.query(
    `INSERT INTO users (id, email, username, display_name, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()`,
    [TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_USERNAME, TEST_DISPLAY_NAME, passwordHash]
  );
  await pool.query(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );

  // Dev account — no password_hash set
  await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       password_hash = NULL,
       updated_at = NOW()`,
    [TEST_DEV_USER_ID, TEST_DEV_EMAIL, TEST_DEV_USERNAME, 'Dev User']
  );
  await pool.query(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO NOTHING`,
    [TEST_DEV_USER_ID]
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
  await pool.query('DELETE FROM player_states WHERE user_id IN ($1, $2)', [TEST_USER_ID, TEST_DEV_USER_ID]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [TEST_USER_ID, TEST_DEV_USER_ID]);
  await pool.end();
  await closeRedis();
});

describe('Settings Profile Route', () => {
  const NEW_DISPLAY_NAME = 'New Display Name';

  test('PATCH /settings/profile updates display name and returns updated user', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ display_name: NEW_DISPLAY_NAME }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('display_name', NEW_DISPLAY_NAME);
    expect(data.data).toHaveProperty('id', TEST_USER_ID);
    expect(data.data).toHaveProperty('email', TEST_USER_EMAIL);
    expect(data.data).toHaveProperty('username', TEST_USER_USERNAME);

    const dbRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(dbRes.rows[0].display_name).toBe(NEW_DISPLAY_NAME);
  });

  test('PATCH /settings/profile rejects empty display_name with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ display_name: '' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Display name is required');
  });

  test('PATCH /settings/profile rejects whitespace-only display_name with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ display_name: '   ' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Display name is required');
  });

  test('PATCH /settings/profile rejects display_name over 50 characters with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ display_name: 'A'.repeat(51) }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Display name must be at most 50 characters');
  });

  test('PATCH /settings/profile trims display name', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ display_name: '  Trimmed Name  ' }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.display_name).toBe('Trimmed Name');

    const dbRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(dbRes.rows[0].display_name).toBe('Trimmed Name');
  });

  test('PATCH /settings/profile requires auth', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Unauth' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Change Password Route', () => {
  const NEW_PASSWORD = 'NewPass456!';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, TEST_USER_ID]
    );
  });

  test('POST /auth/change-password changes password successfully', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const dbRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [TEST_USER_ID]);
    const hashMatchesOld = await bcrypt.compare(TEST_PASSWORD, dbRes.rows[0].password_hash);
    const hashMatchesNew = await bcrypt.compare(NEW_PASSWORD, dbRes.rows[0].password_hash);
    expect(hashMatchesOld).toBe(false);
    expect(hashMatchesNew).toBe(true);
  });

  test('POST /auth/change-password rejects missing fields with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ current_password: TEST_PASSWORD }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Current password and new password are required');
  });

  test('POST /auth/change-password rejects short new password with PASSWORD_TOO_SHORT', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ current_password: TEST_PASSWORD, new_password: '12345' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('PASSWORD_TOO_SHORT');
  });

  test('POST /auth/change-password rejects wrong current password with INVALID_PASSWORD', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ current_password: 'WrongPassword1!', new_password: 'NewPass789!' }),
    });
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_PASSWORD');
  });

  test('POST /auth/change-password returns NO_PASSWORD_SET for dev account (no password_hash)', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(TEST_DEV_USER_ID),
      body: JSON.stringify({ current_password: 'anything', new_password: 'NewPass789!' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('NO_PASSWORD_SET');
  });

  test('POST /auth/change-password requires auth', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'test', new_password: 'newpass123' }),
    });
    expect(res.status).toBe(401);
  });
});
