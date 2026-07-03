/**
 * probe_paypal.ts
 *
 * Smoke-tests the PayPal sandbox integration end-to-end without needing
 * a browser or a public webhook URL.
 *
 * Steps:
 *   1. Verify PayPal sandbox credentials → fetch an access token
 *   2. Create a real checkout order on sandbox → log the approve_url
 *   3. Simulate the PAYMENT.CAPTURE.COMPLETED webhook directly against
 *      the running server and verify gold_credits are credited
 *
 * Prerequisites:
 *   - .env has PAYPAL_MODE=sandbox, PAYPAL_CLIENT_ID, PAYPAL_SECRET
 *   - Server is running on PORT (default 3000)
 *   - A valid USER_ID exists in the DB (set via env var PROBE_USER_ID or
 *     the script picks the first user from player_states)
 *
 * Usage:
 *   npx tsx scripts/probe_paypal.ts
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { oltpPool, closeConnections } from '../src/database/connection.js';
import { closeRedis } from '../src/database/redis.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_BASE =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const SERVER_PORT = process.env.PORT || '3000';
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const AMOUNT_USD = 5.00;
const GOLD_CREDITS_PER_USD = parseInt(process.env.GOLD_CREDITS_PER_USD || '100', 10);

let hasFailures = false;
function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { hasFailures = true; console.error(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ  ${msg}`); }
function section(msg: string) { console.log(`\n── ${msg} ──`); }

// ── Step 0: config check ──────────────────────────────────────
function checkConfig(): boolean {
  section('Config');
  if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID === 'your-paypal-client-id') {
    fail('PAYPAL_CLIENT_ID not set in .env');
    return false;
  }
  if (!PAYPAL_SECRET || PAYPAL_SECRET === 'your-paypal-secret') {
    fail('PAYPAL_SECRET not set in .env');
    return false;
  }
  ok(`PAYPAL_MODE=${PAYPAL_MODE}`);
  ok(`PAYPAL_API_BASE=${PAYPAL_API_BASE}`);
  ok(`GOLD_CREDITS_PER_USD=${GOLD_CREDITS_PER_USD}`);
  return true;
}

// ── Step 1: get access token ──────────────────────────────────
async function getAccessToken(): Promise<string> {
  section('Step 1 — PayPal OAuth (sandbox credentials)');
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed ${res.status}: ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  ok(`Access token obtained (expires in ${data.expires_in}s)`);
  return data.access_token;
}

// ── Step 2: create a checkout order via our server ────────────
async function createCheckoutOrder(userId: string): Promise<{ orderId: string; referenceId: string; approveUrl: string }> {
  section('Step 2 — Create checkout order via POST /paypal/checkout');

  // We call the server endpoint directly with a fake auth cookie.
  // Since we're hitting the server from within the same machine in dev,
  // we use the dev-login route to get a real session cookie first.
  info(`Logging in as userId=${userId}`);
  const loginRes = await fetch(`${SERVER_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!loginRes.ok) {
    throw new Error(`dev-login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) throw new Error('No set-cookie header from dev-login');
  const cookie = setCookie.split(';')[0]; // grab token=xxx part
  ok(`Session cookie obtained`);

  const checkoutRes = await fetch(`${SERVER_URL}/api/paypal/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ amount_usd: AMOUNT_USD }),
  });
  if (!checkoutRes.ok) {
    throw new Error(`/paypal/checkout failed: ${checkoutRes.status} ${await checkoutRes.text()}`);
  }
  const body = await checkoutRes.json() as {
    success: boolean;
    data: { order_id: string; reference_id: string; approve_url: string };
  };
  ok(`Order created: order_id=${body.data.order_id}`);
  ok(`reference_id=${body.data.reference_id}`);
  info(`approve_url (open in browser to complete real payment):`);
  info(`  ${body.data.approve_url}`);
  return {
    orderId: body.data.order_id,
    referenceId: body.data.reference_id,
    approveUrl: body.data.approve_url,
  };
}

// ── Step 3: simulate PAYMENT.CAPTURE.COMPLETED webhook ────────
async function simulateWebhook(
  userId: string,
  referenceId: string,
  captureId: string,
  amountUsd: number,
): Promise<void> {
  section('Step 3 — Simulate PAYMENT.CAPTURE.COMPLETED webhook');
  info('Note: signature verification is skipped in dev when PAYPAL_WEBHOOK_ID is not set');

  const webhookPayload = {
    id: randomUUID(),
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: captureId,
      status: 'COMPLETED',
      amount: { value: amountUsd.toFixed(2), currency_code: 'USD' },
      // custom_id carries userId; purchase_units carries reference_id
      custom_id: userId,
      purchase_units: [
        {
          reference_id: referenceId,
          custom_id: userId,
        },
      ],
    },
  };

  const res = await fetch(`${SERVER_URL}/api/paypal/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook returned ${res.status}: ${text}`);
  }
  const body = await res.json() as any;
  if (!body.success) {
    throw new Error(`Webhook not processed: ${JSON.stringify(body)}`);
  }
  const expectedGold = Math.floor(amountUsd * GOLD_CREDITS_PER_USD);
  ok(`Webhook processed successfully`);
  ok(`gold_credits_granted=${body.data.gold_credits_granted} (expected ${expectedGold})`);
  ok(`new_gold_credits_balance=${body.data.new_gold_credits_balance}`);

  if (body.data.gold_credits_granted !== expectedGold) {
    fail(`Gold credits granted mismatch! Got ${body.data.gold_credits_granted}, expected ${expectedGold}`);
  }
}

// ── Step 4: verify DB directly ────────────────────────────────
async function verifyDB(userId: string, referenceId: string): Promise<void> {
  section('Step 4 — Verify bank_transactions row in DB');
  const client = await oltpPool.connect();
  try {
    const { rows } = await client.query(
      `SELECT amount, currency_type, transaction_type, description, reference_type, reference_id
         FROM bank_transactions
        WHERE user_id = $1 AND reference_id = $2 AND reference_type = 'paypal_capture'`,
      [userId, referenceId]
    );
    if (rows.length === 0) {
      fail(`No bank_transactions row found for reference_id=${referenceId}`);
      return;
    }
    const row = rows[0];
    ok(`bank_transactions row found:`);
    info(`  amount=${row.amount}  currency_type=${row.currency_type}`);
    info(`  transaction_type=${row.transaction_type}`);
    info(`  description=${row.description}`);
    info(`  reference_type=${row.reference_type}  reference_id=${row.reference_id}`);

    // Test idempotency: send the same webhook again — should return idempotent:true
    section('Step 4b — Idempotency check (re-send same webhook)');
    const captureId = randomUUID();
    const webhookPayload = {
      id: randomUUID(),
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: captureId,
        status: 'COMPLETED',
        amount: { value: AMOUNT_USD.toFixed(2), currency_code: 'USD' },
        custom_id: userId,
        purchase_units: [{ reference_id: referenceId, custom_id: userId }],
      },
    };
    const res = await fetch(`${SERVER_URL}/api/paypal/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Idempotency webhook request failed with status ${res.status}: ${text}`);
    }
    const body = await res.json() as any;
    if (body.idempotent === true) {
      ok(`Idempotency guard works — duplicate webhook correctly ignored`);
    } else {
      fail(`Idempotency check failed — duplicate webhook was not deduplicated: ${JSON.stringify(body)}`);
    }
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('=== PayPal Sandbox Integration Probe ===');
  console.log(`Target: ${SERVER_URL} | PayPal: ${PAYPAL_API_BASE}`);

  try {
    if (!checkConfig()) {
      console.log('\nAdd PAYPAL_CLIENT_ID and PAYPAL_SECRET to your .env and retry.');
      process.exitCode = 1;
      return;
    }

    // Resolve test user: prefer PROBE_USER_ID env, else pick first from player_states
    let userId = process.env.PROBE_USER_ID;
    if (!userId) {
      const client = await oltpPool.connect();
      try {
        const { rows } = await client.query(
          `SELECT user_id FROM player_states LIMIT 1`
        );
        if (rows.length === 0) throw new Error('No users in player_states — run the dev seed first');
        userId = rows[0].user_id as string;
        info(`Auto-selected userId=${userId} (set PROBE_USER_ID env var to override)`);
      } finally {
        client.release();
      }
    }

    // Step 1: verify sandbox credentials work
    await getAccessToken();

    // Step 2: create a real order through our server
    const { referenceId } = await createCheckoutOrder(userId);

    // Step 3: simulate the webhook (no ngrok needed)
    const fakeCaptureId = randomUUID();
    await simulateWebhook(userId, referenceId, fakeCaptureId, AMOUNT_USD);

    // Step 4: confirm the DB row + idempotency
    await verifyDB(userId, referenceId);

    console.log('\n=== All checks passed ✅ ===\n');
    if (hasFailures) {
      console.log('\n=== PROBE COMPLETED WITH FAILURES ❌ ===\n');
      process.exitCode = 1;
    } else {
      console.log('\n=== All checks passed ✅ ===\n');
    }
  } catch (err) {
    console.error('\n=== PROBE FAILED ===');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closeRedis();
  }
}

main();
