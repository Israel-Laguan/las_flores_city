/**
 * PayPal Webhook Integration Tests
 *
 * Task 4.3 (PayPal, Gold Creds, & The "MyMe" Marketplace)
 *
 * Verifies the dedup path on PAYMENT.CAPTURE.COMPLETED:
 *  - First delivery grants gold_credits + writes bank_transactions
 *  - Second redelivery (same reference_id) returns 200 OK idempotent
 *    without double-granting, and the partial UNIQUE index protects us.
 *
 * Without PAYPAL_WEBHOOK_ID set, the route skips signature verification
 * and processes the event end-to-end (sandbox/dev path). This test
 * deliberately does NOT set PAYPAL_WEBHOOK_ID so the route runs.
 *
 * Per AGENTS.md: dedicated UUIDs, beforeAll/afterAll cleanup.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import express from 'express';
import { paypalRouter } from '../../src/routes/paypal.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis, deleteCache } from '../../src/database/redis.js';

const { Pool } = pg;

// Dedicated UUIDs (collision-avoidance: 7..8 in the 13th position).
const TEST_USER_ID = '00000000-0000-0000-0000-000000000078';
// This UUID will be both the PayPal purchase_units[0].reference_id and
// the bank_transactions.reference_id. Set per-test with crypto.randomUUID.
const CAPTURE_ID_A = '3C679366HH908993F'; // PayPal capture id (alphanumeric, NOT a UUID)
const CAPTURE_ID_B = '4D790477II019004G';

const app = express();
app.use(express.json());
app.use('/paypal', paypalRouter);

let server: ReturnType<typeof express.Application.listen>;
let oltpPool: pg.Pool;
let olapPool: pg.Pool;
let port: number;

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

  await applyMigration(oltpPool, '024_marketplace.sql');
  await applyMigration(olapPool, '025_marketplace_olap.sql');

  // Dedicated test user (auth NOT used — webhook is unauthenticated —
  // but the user must exist for the FK on bank_transactions.user_id
  // and the UPDATE on users to succeed).
  await oltpPool.query(
    `INSERT INTO users (id, email, username, display_name, time_blocks, credits, gold_credits)
     VALUES ($1, 'paypal-test@example.com', 'paypal_test', 'PayPal Test', 48, 0, 0)
     ON CONFLICT (id) DO UPDATE SET
       time_blocks = 48, credits = 0, gold_credits = 0, updated_at = NOW()`,
    [TEST_USER_ID]
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
    // already closed
  }
  await oltpPool.query('DELETE FROM player_events WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await oltpPool.end();
  await olapPool.end();
  await closeRedis();
});

async function resetPayPalState() {
  await oltpPool.query('DELETE FROM player_events WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query('DELETE FROM bank_transactions WHERE user_id = $1', [TEST_USER_ID]);
  await oltpPool.query(
    `UPDATE users SET gold_credits = 0, updated_at = NOW() WHERE id = $1`,
    [TEST_USER_ID]
  );
  await deleteCache(`user:state:${TEST_USER_ID}`);
}

function craftWebhookEvent(referenceId: string, captureId: string, amountUsd: number) {
  return {
    id: `WH-${captureId}`,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture',
    resource: {
      id: captureId,
      status: 'COMPLETED',
      custom_id: TEST_USER_ID,
      amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
      purchase_units: [
        {
          custom_id: TEST_USER_ID,
          reference_id: referenceId,
          amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
        },
      ],
    },
  };
}

describe('PayPal webhook (PAYMENT.CAPTURE.COMPLETED)', () => {
  test('first delivery grants gold_credits and writes bank_transactions', async () => {
    await resetPayPalState();
    const referenceId = '11111111-1111-4111-8111-111111111111';

    const res = await fetch(`http://localhost:${port}/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(craftWebhookEvent(referenceId, CAPTURE_ID_A, 5)),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(true);
    expect(data.data.reference_id).toBe(referenceId);
    // 5 USD × 100 G$/USD = 500 G$
    expect(data.data.gold_credits_granted).toBe(500);

    // Verify balance was granted
    const userRes = await oltpPool.query('SELECT gold_credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].gold_credits).toBe(500);

    // Verify bank_transactions row exists with our UUID as reference_id
    const txRes = await oltpPool.query(
      `SELECT amount, balance_after, reference_type, reference_id
       FROM bank_transactions
       WHERE user_id = $1 AND reference_type = 'paypal_capture'`,
      [TEST_USER_ID]
    );
    expect(txRes.rows.length).toBe(1);
    expect(txRes.rows[0].amount).toBe(500);
    expect(txRes.rows[0].balance_after).toBe(500);
    expect(txRes.rows[0].reference_id).toBe(referenceId);
  });

  test('redelivery with same reference_id is idempotent (no double-grant)', async () => {
    await resetPayPalState();
    const referenceId = '22222222-2222-4222-8222-222222222222';

    // First delivery
    const first = await fetch(`http://localhost:${port}/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(craftWebhookEvent(referenceId, CAPTURE_ID_B, 10)),
    });
    expect(first.status).toBe(200);

    // Second delivery (PayPal redelivery for the same event)
    const second = await fetch(`http://localhost:${port}/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(craftWebhookEvent(referenceId, CAPTURE_ID_B, 10)),
    });
    const data = await second.json();

    // Idempotent path returns 200 with `idempotent: true`
    expect(second.status).toBe(200);
    expect(data.idempotent).toBe(true);
    expect(data.processed).toBe(false);
    expect(data.reference_id).toBe(referenceId);

    // Balance should still be 10 USD × 100 = 1000 G$ — NOT 2000
    const userRes = await oltpPool.query('SELECT gold_credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].gold_credits).toBe(1000);

    // bank_transactions should still have only ONE paypal_capture row
    const txRes = await oltpPool.query(
      `SELECT COUNT(*)::int AS n FROM bank_transactions
       WHERE user_id = $1 AND reference_type = 'paypal_capture'`,
      [TEST_USER_ID]
    );
    expect(txRes.rows[0].n).toBe(1);
  });

  test('non-completed events are 200-acked without processing', async () => {
    await resetPayPalState();
    const referenceId = '33333333-3333-4333-8333-333333333333';
    const event = craftWebhookEvent(referenceId, 'PENDINGCAP123', 7);
    event.resource.status = 'PENDING';

    const res = await fetch(`http://localhost:${port}/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
    expect(data.processed).toBe(false);

    // No balance change, no bank_transactions row
    const userRes = await oltpPool.query('SELECT gold_credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].gold_credits).toBe(0);
  });

  test('missing reference_id is 200-acked without processing', async () => {
    await resetPayPalState();
    const event = {
      id: 'WH-NO-REF',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      resource: {
        id: 'NO-REF-123',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '5.00' },
        purchase_units: [
          {
            custom_id: TEST_USER_ID,
            // reference_id intentionally omitted
            amount: { currency_code: 'USD', value: '5.00' },
          },
        ],
      },
    };

    const res = await fetch(`http://localhost:${port}/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
    expect(data.processed).toBe(false);

    const userRes = await oltpPool.query('SELECT gold_credits FROM users WHERE id = $1', [TEST_USER_ID]);
    expect(userRes.rows[0].gold_credits).toBe(0);
  });
});

describe('PayPal checkout (POST /paypal/checkout)', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await fetch(`http://localhost:${port}/paypal/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_usd: 5 }),
    });
    // authMiddleware is applied — without a token this should be 401
    expect(res.status).toBe(401);
  });

  test('rejects invalid amount_usd (out of range)', async () => {
    const res = await fetch(`http://localhost:${port}/paypal/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateToken(TEST_USER_ID)}`,
      },
      body: JSON.stringify({ amount_usd: 0 }),
    });
    expect(res.status).toBe(400);
  });
});
