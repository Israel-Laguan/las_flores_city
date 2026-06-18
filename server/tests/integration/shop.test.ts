/**
 * Shop / MyMe Marketplace Integration Tests
 *
 * Task 4.3 (PayPal, Gold Creds, & The "MyMe" Marketplace)
 *
 * Verifies:
 *  - GET /shop/catalog returns active items, cached
 *  - GET /shop/inventory returns the user's owned items
 *  - POST /shop/buy happy path (purchase credits-priced item)
 *  - POST /shop/buy INSUFFICIENT_FUNDS (price > balance)
 *  - POST /shop/buy ALREADY_OWNED (second purchase of same item)
 *  - POST /shop/equip sets equipped_theme_id / equipped_border_id
 *  - GET /shop/profile/:userId returns equipped cosmetics
 *
 * Per AGENTS.md: each test uses a dedicated UUID, creates its own
 * test user in beforeAll, and cleans up in afterAll (try/finally).
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import express from 'express';
import { shopRouter } from '../../src/routes/shop.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis, deleteCache } from '../../src/database/redis.js';

const { Pool } = pg;

// Dedicated UUIDs for shop tests. Collision-avoidance:
//  - TEST_USER_ID: 7..7 in the 13th position to differentiate from vault.test
//  - THEME_ITEM_ID: synthetic UUID for a credits-priced ui_theme
//  - BORDER_ITEM_ID: synthetic UUID for a credits-priced avatar_border
//  - GOLD_ITEM_ID: synthetic UUID for a gold_credits-priced item
//  - LUXURY_ITEM_ID: synthetic UUID for a high-priced (overdraft) item
const TEST_USER_ID = '00000000-0000-0000-0000-000000000077';
const THEME_ITEM_ID = 'b1b2c3d4-e29b-41d4-a716-446655440001';
const BORDER_ITEM_ID = 'b1b2c3d4-e29b-41d4-a716-446655440002';
const GOLD_ITEM_ID = 'b1b2c3d4-e29b-41d4-a716-446655440003';
const LUXURY_ITEM_ID = 'b1b2c3d4-e29b-41d4-a716-446655440004';

const app = express();
app.use(express.json());
app.use('/shop', shopRouter);

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
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });
  olapPool = new Pool({
    connectionString:
      process.env.ANALYTICS_DATABASE_URL ||
      'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
    connectionTimeoutMillis: 5000,
  });

  // Apply migration 024 (OLTP) and 025 (OLAP). Best-effort — earlier
  // tests may have already applied them. Migrations are idempotent.
  await applyMigration(oltpPool, '024_marketplace.sql');
  await applyMigration(olapPool, '025_marketplace_olap.sql');

  // Create the dedicated test user with 200 credits, 0 gold_credits.
  await oltpPool.query(
    `INSERT INTO users (id, email, username, display_name, time_blocks, credits, gold_credits)
     VALUES ($1, 'shop-test@example.com', 'shop_test', 'Shop Test', 48, 200, 0)
     ON CONFLICT (id) DO UPDATE SET
       time_blocks = 48, credits = 200, gold_credits = 0, updated_at = NOW()`,
    [TEST_USER_ID]
  );
  await oltpPool.query(
    `INSERT INTO player_states (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );

  // Seed 4 shop items: 2 credits-priced (theme, border), 1 gold_credits-priced, 1 luxury
  await oltpPool.query(
    `INSERT INTO shop_items
       (id, name, description, item_type, price, currency_type, asset_url, is_active)
     VALUES
       ($1, 'Neon Tokyo Theme', 'A neon-soaked UI theme', 'ui_theme', 50, 'credits',
         'https://cdn.lasflores2077.com/shop/neon_tokyo.png', true),
       ($2, 'Gold Border', 'A gold avatar border', 'avatar_border', 50, 'credits',
         'https://cdn.lasflores2077.com/shop/gold_border.png', true),
       ($3, 'Founder Skin', 'Founders-only skin', 'character_skin', 100, 'gold_credits',
         'https://cdn.lasflores2077.com/shop/founder.png', true),
       ($4, 'Diamond Border', 'An absurdly priced border', 'avatar_border', 9999, 'credits',
         'https://cdn.lasflores2077.com/shop/diamond.png', true)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       price = EXCLUDED.price,
       currency_type = EXCLUDED.currency_type,
       is_active = EXCLUDED.is_active`,
    [THEME_ITEM_ID, BORDER_ITEM_ID, GOLD_ITEM_ID, LUXURY_ITEM_ID]
  );

  server = await new Promise<ReturnType<typeof express.Application.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  try {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    );
  } catch {
    // server may already be closed
  }
  // Cleanup all rows tied to TEST_USER_ID (per AGENTS.md test-fixture rule)
  await oltpPool.query('DELETE FROM public_profiles WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_inventory WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  // Shop items are shared — leave them; they're cleaned up by the test runner
  // only if no other test depends on them.
  await oltpPool.end();
  await olapPool.end();
  await closeRedis();
});

async function resetShopState() {
  await oltpPool.query('DELETE FROM public_profiles WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM player_inventory WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query(
    `UPDATE users SET credits = 200, gold_credits = 0, updated_at = NOW() WHERE id = $1`,
    [TEST_USER_ID]
  );
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await deleteCache(`user:inventory:${TEST_USER_ID}`);
  await deleteCache('shop:catalog:active');
}

describe('Shop API', () => {
  test('GET /shop/catalog returns active items', async () => {
    await resetShopState();
    const res = await fetch(`http://localhost:${port}/shop/catalog`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    const ids = data.data.map((it: any) => it.id);
    expect(ids).toContain(THEME_ITEM_ID);
    expect(ids).toContain(BORDER_ITEM_ID);
    expect(ids).toContain(GOLD_ITEM_ID);
    expect(ids).toContain(LUXURY_ITEM_ID);
  });

  test('GET /shop/inventory returns empty for new player', async () => {
    await resetShopState();
    const res = await fetch(`http://localhost:${port}/shop/inventory`, { headers: auth() });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
  });

  test('POST /shop/buy happy path: credits-priced theme', async () => {
    await resetShopState();
    const res = await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: THEME_ITEM_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.currency_type).toBe('credits');
    expect(data.data.new_balance).toBe(150); // 200 - 50
    expect(data.data.inventory_item.shop_item_id).toBe(THEME_ITEM_ID);

    // Verify balance was actually debited
    const userRes = await oltpPool.query('SELECT credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].credits).toBe(150);

    // Verify inventory row exists
    const invRes = await oltpPool.query(
      `SELECT acquired_via, reference_id FROM player_inventory
       WHERE user_id = $1 AND shop_item_id = $2`,
      [TEST_USER_ID, THEME_ITEM_ID]
    );
    expect(invRes.rows.length).toBe(1);
    expect(invRes.rows[0].acquired_via).toBe('purchase');
    expect(invRes.rows[0].reference_id).toBe(THEME_ITEM_ID);
  });

  test('POST /shop/buy returns ALREADY_OWNED on second purchase of same item', async () => {
    await resetShopState();
    // First buy succeeds
    const first = await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: THEME_ITEM_ID }),
    });
    expect(first.status).toBe(200);

    // Second buy of same item returns 409
    const second = await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: THEME_ITEM_ID }),
    });
    const data = await second.json();

    expect(second.status).toBe(409);
    expect(data.error).toBe('ALREADY_OWNED');
  });

  test('POST /shop/buy returns INSUFFICIENT_FUNDS when price > balance', async () => {
    await resetShopState();
    const res = await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: LUXURY_ITEM_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(402);
    expect(data.error).toBe('INSUFFICIENT_FUNDS');

    // Verify balance was NOT debited
    const userRes = await oltpPool.query('SELECT credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].credits).toBe(200);
  });

  test('POST /shop/buy returns ITEM_NOT_FOUND for unknown id', async () => {
    await resetShopState();
    const res = await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: '00000000-0000-0000-0000-000000000099' }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('ITEM_NOT_FOUND');
  });

  test('POST /shop/equip sets equipped_theme_id and rejects non-owned items', async () => {
    await resetShopState();
    // First buy the theme
    await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: THEME_ITEM_ID }),
    });

    // Equip it
    const equipRes = await fetch(`http://localhost:${port}/shop/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ slot: 'theme', shop_item_id: THEME_ITEM_ID }),
    });
    const equipData = await equipRes.json();

    expect(equipRes.status).toBe(200);
    expect(equipData.success).toBe(true);

    // Verify the public_profiles row has the FK set
    const profRes = await oltpPool.query(
      `SELECT equipped_theme_id, equipped_border_id FROM public_profiles WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    expect(profRes.rows.length).toBe(1);
    expect(profRes.rows[0].equipped_theme_id).toBe(THEME_ITEM_ID);
    expect(profRes.rows[0].equipped_border_id).toBeNull();

    // Try to equip a non-owned item
    const badEquip = await fetch(`http://localhost:${port}/shop/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ slot: 'border', shop_item_id: BORDER_ITEM_ID }),
    });
    // Either 403/400 — what matters is that the FK is NOT set
    expect([400, 403, 404]).toContain(badEquip.status);

    const profAfter = await oltpPool.query(
      `SELECT equipped_border_id FROM public_profiles WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    expect(profAfter.rows[0].equipped_border_id).toBeNull();
  });

  test('GET /shop/profile/:userId returns equipped cosmetics', async () => {
    await resetShopState();
    // Buy + equip theme and border
    await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: THEME_ITEM_ID }),
    });
    await fetch(`http://localhost:${port}/shop/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ shop_item_id: BORDER_ITEM_ID }),
    });
    await fetch(`http://localhost:${port}/shop/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ slot: 'theme', shop_item_id: THEME_ITEM_ID }),
    });
    await fetch(`http://localhost:${port}/shop/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ slot: 'border', shop_item_id: BORDER_ITEM_ID }),
    });

    const res = await fetch(`http://localhost:${port}/shop/profile/${TEST_USER_ID}`, {
      headers: auth(),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.user_id).toBe(TEST_USER_ID);
    expect(data.data.equipped_theme).toBeTruthy();
    expect(data.data.equipped_theme.id).toBe(THEME_ITEM_ID);
    expect(data.data.equipped_border).toBeTruthy();
    expect(data.data.equipped_border.id).toBe(BORDER_ITEM_ID);
  });
});
