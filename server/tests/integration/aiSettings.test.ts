import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import pg from 'pg';
import { settingsRouter } from '../../src/routes/settings.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '../../src/database/redis.js';

// ============================================================
// BYOK Settings Route Integration Tests (Task 4.1)
//
// Validates the server-side contract for split-key storage:
//   POST   /settings/ai-key        — store ciphertext + iv
//   GET    /settings/ai-key-share  — return ciphertext + iv
//   PATCH  /settings/ai-enabled    — toggle the enabled flag
//
// The server MUST be storage-blind: it never sees the raw key,
// never the local AES key, and never the LLM provider. The
// server's only job is to persist the ciphertext blob.
// ============================================================

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-0000000aa101';
const TEST_USER_EMAIL = 'byok-settings-test@example.com';
const TEST_USER_USERNAME = 'byok_settings_test';

const CIPHERTEXT = Buffer.from('mock-ciphertext-bytes-aes-gcm-256').toString('base64');
const IV = Buffer.from('0123456789ab').toString('base64');

const app = express();
app.use(express.json());
app.use('/settings', settingsRouter);

let server: any;
let pool: pg.Pool;

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}`, 'Content-Type': 'application/json' };
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  // Dedicated UUID (collision-avoidance) — not shared with other integration tests.
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await pool.query(
    `INSERT INTO users (id, email, username, display_name, time_blocks, credits, ai_enabled)
     VALUES ($1, $2, $3, $4, 48, 100, FALSE)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       ai_key_ciphertext = NULL,
       ai_key_iv = NULL,
       ai_enabled = FALSE,
       updated_at = NOW()`,
    [TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_USERNAME, 'BYOK Settings Test']
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await pool.end();
  await closeRedis();
});

describe('BYOK Settings Route (Task 4.1)', () => {
  test('POST /settings/ai-key stores ciphertext + iv and returns success', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-key`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ciphertext: CIPHERTEXT, iv: IV, enabled: true }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('enabled', true);
    expect(data).toHaveProperty('timestamp');

    // Verify it actually landed in the DB
    const dbRes = await pool.query(
      'SELECT ai_key_ciphertext, ai_key_iv, ai_enabled FROM users WHERE id = $1',
      [TEST_USER_ID]
    );
    expect(dbRes.rows[0].ai_key_ciphertext).toBe(CIPHERTEXT);
    expect(dbRes.rows[0].ai_key_iv).toBe(IV);
    expect(dbRes.rows[0].ai_enabled).toBe(true);
  });

  test('POST /settings/ai-key rejects missing ciphertext with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-key`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ iv: IV, enabled: true }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('ciphertext and iv are required');
  });

  test('GET /settings/ai-key-share returns the stored ciphertext + iv', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-key-share`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.ciphertext).toBe(CIPHERTEXT);
    expect(data.data.iv).toBe(IV);
    expect(data.data.enabled).toBe(true);
  });

  test('GET /settings/ai-key-share returns 404 NO_KEY_FOUND after clearing', async () => {
    // Clear the columns
    await pool.query(
      'UPDATE users SET ai_key_ciphertext = NULL, ai_key_iv = NULL, ai_enabled = FALSE WHERE id = $1',
      [TEST_USER_ID]
    );

    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-key-share`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('NO_KEY_FOUND');
  });

  test('PATCH /settings/ai-enabled toggles the enabled flag without touching ciphertext', async () => {
    // Re-store a ciphertext blob so we can verify it survives the toggle.
    await pool.query(
      'UPDATE users SET ai_key_ciphertext = $1, ai_key_iv = $2, ai_enabled = TRUE WHERE id = $3',
      [CIPHERTEXT, IV, TEST_USER_ID]
    );

    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-enabled`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ enabled: false }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.enabled).toBe(false);

    // Ciphertext and iv must be intact
    const dbRes = await pool.query(
      'SELECT ai_key_ciphertext, ai_key_iv, ai_enabled FROM users WHERE id = $1',
      [TEST_USER_ID]
    );
    expect(dbRes.rows[0].ai_key_ciphertext).toBe(CIPHERTEXT);
    expect(dbRes.rows[0].ai_key_iv).toBe(IV);
    expect(dbRes.rows[0].ai_enabled).toBe(false);
  });

  test('PATCH /settings/ai-enabled rejects non-boolean with 400', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-enabled`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ enabled: 'yes' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('enabled must be a boolean');
  });

  test('settings route requires auth', async () => {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/settings/ai-key-share`);
    expect(res.status).toBe(401);
  });
});
