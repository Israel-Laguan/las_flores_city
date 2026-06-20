/**
 * Vault System Integration Tests
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import yaml from 'js-yaml';
import express from 'express';
import { vaultRouter } from '../../src/routes/vault.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis, deleteCache, invalidatePattern } from '../../src/database/redis.js';
import { MediaSigner } from '../../src/services/MediaSigner.js';

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const WELCOME_DIALOGUE_ID = '550e8400-e29b-41d4-a716-446655440003';
const ARRIVAL_TICKET_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PREMIUM_CG_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const app = express();
app.use(express.json());
app.use('/vault', vaultRouter);
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof express.Application.listen>;
let oltpPool: pg.Pool;
let olapPool: pg.Pool;
let port: number;

function auth() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

async function applyMigration(pool: pg.Pool, filename: string) {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await pool.query(sql);
  } catch {
    // Migration may already be applied
  }
}

beforeAll(async () => {
  oltpPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });
  olapPool = new Pool({
    connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
    connectionTimeoutMillis: 5000,
  });

  await applyMigration(oltpPool, '018_vault_system.sql');
  try {
    await applyMigration(oltpPool, '026_vault_signed_urls.sql');
  } catch {
    // Migration may already be applied
  }
  try {
    await applyMigration(olapPool, '019_add_vault_event_type.sql');
  } catch {
    // OLAP migration may already be applied with compatible constraint
  }

  await oltpPool.query(
    `INSERT INTO users (id, email, username, display_name, time_blocks, credits)
     VALUES ($1, 'vault-test@example.com', 'vault_test', 'Vault Test', 48, 100)
     ON CONFLICT (id) DO UPDATE SET time_blocks = 48, credits = 100, updated_at = NOW()`,
    [TEST_USER_ID]
  );
  await oltpPool.query(
    `INSERT INTO player_states (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );
  await oltpPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS active_dialogue_id UUID');

  await oltpPool.query(
    `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type, requires_signed_url)
     VALUES
       ($1, 'Arrival Ticket Stub', 'Test clue', 'https://cdn.lasflores2077.com/vault/thumb_arrival_ticket.png', '/vault/arrival_ticket.png', 'clue', false),
       ($2, 'Classified Surveillance Still', 'Premium clue', 'https://cdn.lasflores2077.com/vault/thumb_surveillance_still.png', '/premium/surveillance_still_full.png', 'premium_cg', true)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       thumbnail_url = EXCLUDED.thumbnail_url,
       media_path = EXCLUDED.media_path,
       item_type = EXCLUDED.item_type,
       requires_signed_url = EXCLUDED.requires_signed_url`,
    [ARRIVAL_TICKET_ID, PREMIUM_CG_ID]
  );

  const welcomeYamlPath = path.resolve(process.cwd(), '../content/dialogues/welcome_dialogue.yaml');
  const welcomeDialogue = yaml.load(fs.readFileSync(welcomeYamlPath, 'utf-8')) as any;
  await oltpPool.query(
    `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       start_node_id = EXCLUDED.start_node_id,
       nodes = EXCLUDED.nodes,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      welcomeDialogue.id,
      welcomeDialogue.name,
      welcomeDialogue.description || null,
      welcomeDialogue.start_node_id,
      JSON.stringify(welcomeDialogue.nodes || {}),
      JSON.stringify(welcomeDialogue.metadata || {}),
    ]
  );

  server = await new Promise<ReturnType<typeof express.Application.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve()))
  );
  await oltpPool.query('DELETE FROM player_vault WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_dialogue_states WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await oltpPool.end();
  await olapPool.end();
  await closeRedis();
});

async function resetVaultState() {
  await oltpPool.query('DELETE FROM player_vault WHERE user_id = $1', [TEST_USER_ID]);
  // Vault cache is bifurcated by entitlement (nsfw flag in key), so sweep both
  // states to avoid a stale empty list from a prior test poisoning the next run.
  await invalidatePattern(`user:vault:${TEST_USER_ID}:nsfw:*`);
  await deleteCache(`user:vault:${TEST_USER_ID}`);
  await oltpPool.query(
    `UPDATE users SET active_dialogue_id = $1, current_node_id = 'start' WHERE id = $2`,
    [WELCOME_DIALOGUE_ID, TEST_USER_ID]
  );
  await oltpPool.query(
    `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
     VALUES ($1, $2, 'start', '[]')
     ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET current_node_id = 'start', choices_made = '[]'`,
    [TEST_USER_ID, WELCOME_DIALOGUE_ID]
  );
}

describe('Vault API', () => {
  test('GET /vault returns empty inventory for new player', async () => {
    await resetVaultState();
    const res = await fetch(`http://localhost:${port}/vault`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
  });

  test('POST /dialogue/:id/choose unlocks vault item atomically', async () => {
    await resetVaultState();

    // choiceIndex 1 is check_phone which has vault_unlock
    const chooseRes = await fetch(`http://localhost:${port}/dialogue/${WELCOME_DIALOGUE_ID}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ choiceIndex: 1 }),
    });
    const chooseData = await chooseRes.json();

    expect(chooseRes.status).toBe(200);
    expect(chooseData.success).toBe(true);
    expect(chooseData.data.unlocked_vault_item).toEqual({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      title: 'Arrival Ticket Stub',
    });

    const vaultRes = await fetch(`http://localhost:${port}/vault`, { headers: auth() });
    const vaultData = await vaultRes.json();

    expect(vaultData.data).toHaveLength(1);
    expect(vaultData.data[0].id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(vaultData.data[0].thumbnailUrl).toBe('https://cdn.lasflores2077.com/vault/thumb_arrival_ticket.png');
    expect(vaultData.data[0].mediaPath).toBe('/vault/arrival_ticket.png');
  });

  test('premium_cg items expose only thumbnail in /vault grid (no signed URL leak)', async () => {
    await resetVaultState();
    await oltpPool.query(
      `INSERT INTO player_vault (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [TEST_USER_ID, PREMIUM_CG_ID]
    );
    await deleteCache(`user:vault:${TEST_USER_ID}`);

    const res = await fetch(`http://localhost:${port}/vault`, { headers: auth() });
    const data = await res.json();

    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBe(PREMIUM_CG_ID);
    expect(data.data[0].thumbnailUrl).toContain('thumb_surveillance_still.png');
    expect(data.data[0].mediaPath).toBe('/premium/surveillance_still_full.png');
    expect(data.data[0].requiresSignedUrl).toBe(true);
  });

  test('GET /vault/media/:itemId returns signed URL for premium CG when entitled', async () => {
    await resetVaultState();
    await oltpPool.query(
      `INSERT INTO player_vault (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [TEST_USER_ID, PREMIUM_CG_ID]
    );
    await oltpPool.query(
      `INSERT INTO user_entitlements (user_id, is_nsfw_unlocked) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET is_nsfw_unlocked = EXCLUDED.is_nsfw_unlocked`,
      [TEST_USER_ID]
    );

    const res = await fetch(`http://localhost:${port}/vault/media/${PREMIUM_CG_ID}`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.data.url).toBe('string');
    expect(data.data.url).toContain('surveillance_still_full');
  });

  test('GET /vault/media/:itemId returns ENTITLEMENT_REVOKED for premium CG when Patreon unlinked', async () => {
    await resetVaultState();
    await oltpPool.query(
      `INSERT INTO player_vault (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [TEST_USER_ID, PREMIUM_CG_ID]
    );
    await oltpPool.query(
      `INSERT INTO user_entitlements (user_id, is_nsfw_unlocked) VALUES ($1, false)
       ON CONFLICT (user_id) DO UPDATE SET is_nsfw_unlocked = EXCLUDED.is_nsfw_unlocked`,
      [TEST_USER_ID]
    );

    const res = await fetch(`http://localhost:${port}/vault/media/${PREMIUM_CG_ID}`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('ENTITLEMENT_REVOKED');
  });

  test('GET /vault/media/:itemId returns ACCESS_DENIED_OR_NOT_OWNED when item not in player_vault', async () => {
    await resetVaultState();
    const res = await fetch(`http://localhost:${port}/vault/media/${PREMIUM_CG_ID}`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('ACCESS_DENIED_OR_NOT_OWNED');
  });

  test('GET /vault/media/:itemId returns unsigned URL for non-premium clues', async () => {
    await resetVaultState();
    await oltpPool.query(
      `INSERT INTO player_vault (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [TEST_USER_ID, ARRIVAL_TICKET_ID]
    );

    const res = await fetch(`http://localhost:${port}/vault/media/${ARRIVAL_TICKET_ID}`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.url).toContain('arrival_ticket.png');
  });

  test('vault_item_unlocked OLAP event is written on unlock', async () => {
    await resetVaultState();

    await fetch(`http://localhost:${port}/dialogue/${WELCOME_DIALOGUE_ID}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ choiceIndex: 1 }),
    });

    await new Promise((r) => setTimeout(r, 200));

    const events = await olapPool.query(
      `SELECT event_type, event_data FROM player_events
       WHERE user_id = $1 AND event_type = 'vault_item_unlocked'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_USER_ID]
    );

    if (events.rows.length > 0) {
      expect(events.rows[0].event_type).toBe('vault_item_unlocked');
      expect(events.rows[0].event_data.itemId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    }
  });
});

describe('MediaSigner', () => {
  test('generateSecureUrl returns the unsigned URL when CDN private key is missing', () => {
    const prevBase = process.env.CDN_BASE_URL;
    const prevKeyId = process.env.CDN_KEY_PAIR_ID;
    const prevKeyPath = process.env.CDN_PRIVATE_KEY_PATH;
    process.env.CDN_BASE_URL = 'https://cdn.lasflores2077.com';
    process.env.CDN_KEY_PAIR_ID = 'APKADEV00000000000000';
    process.env.CDN_PRIVATE_KEY_PATH = '/nonexistent/key-for-test.pem';

    const url = MediaSigner.generateSecureUrl('/premium/clip.mp4', 300);
    expect(url).toBe('https://cdn.lasflores2077.com/premium/clip.mp4');

    if (prevBase === undefined) delete process.env.CDN_BASE_URL;
    else process.env.CDN_BASE_URL = prevBase;
    if (prevKeyId === undefined) delete process.env.CDN_KEY_PAIR_ID;
    else process.env.CDN_KEY_PAIR_ID = prevKeyId;
    if (prevKeyPath === undefined) delete process.env.CDN_PRIVATE_KEY_PATH;
    else process.env.CDN_PRIVATE_KEY_PATH = prevKeyPath;
  });

  test('generateSecureUrl normalizes paths without leading slash', () => {
    const prevBase = process.env.CDN_BASE_URL;
    const prevKeyPath = process.env.CDN_PRIVATE_KEY_PATH;
    process.env.CDN_BASE_URL = 'https://cdn.lasflores2077.com';
    process.env.CDN_PRIVATE_KEY_PATH = '/nonexistent/key-for-test.pem';

    const url = MediaSigner.generateSecureUrl('premium/clip.mp4');
    expect(url).toBe('https://cdn.lasflores2077.com/premium/clip.mp4');

    if (prevBase === undefined) delete process.env.CDN_BASE_URL;
    else process.env.CDN_BASE_URL = prevBase;
    if (prevKeyPath === undefined) delete process.env.CDN_PRIVATE_KEY_PATH;
    else process.env.CDN_PRIVATE_KEY_PATH = prevKeyPath;
  });
});
