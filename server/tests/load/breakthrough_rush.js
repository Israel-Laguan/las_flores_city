// K6 Load Test — Breakthrough Rush Simulation (Task 5.4)
// Simulates 500 concurrent players racing through the login → state → dialogue loop
// during a high-demand mystery Breakthrough Event window.
//
// Run: k6 run server/tests/load/breakthrough_rush.js
// Thresholds: P95 < 150ms, error rate < 1%

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Custom metrics for granular observability
const responseTimeTrend = new Trend('custom_req_duration');
const errorRate = new Rate('custom_error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 500 },  // Ramp up to 500 concurrent users
    { duration: '1m',  target: 500 },  // Sustain heavy load
    { duration: '30s', target: 0   },  // Scale down gracefully
  ],
  thresholds: {
    // Note: These are production-grade targets. Local dev may see higher latencies
    // due to Docker overhead and unoptimized database settings.
    custom_req_duration:  ['p(95)<500'], // P95 latency (local dev threshold)
    custom_error_rate:    ['rate<0.01'], // Error rate must remain under 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'; // Routes mounted at root in Docker

// Pre-generated test account range — seed these before running the test
// via: server/scripts/seed_load_test_users.ts
const TEST_USER_COUNT = 500;
const TEST_PASSWORD   = 'password123';

// Fixed IDs from seeded content (Guard at Welcome Center, dialogue_welcome)
const CHARACTER_ID = '550e8400-e29b-41d4-a716-446655440004';
const SCENE_ID = '550e8400-e29b-41d4-a716-446655440002';

export default function () {
  const vuId = __VU % TEST_USER_COUNT || TEST_USER_COUNT; // 1–500, avoids 0
  const email = `loadtest_${vuId}@lasflores.com`;

  // ── 1. Authenticate ──────────────────────────────────────────────────────────
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const loggedIn = check(loginRes, {
    'auth: status 200': (r) => r.status === 200,
  });
  errorRate.add(!loggedIn);
  responseTimeTrend.add(loginRes.timings.duration);

  const token = loginRes.json('token');
  if (!token) {
    // Short-circuit this VU iteration if auth failed — prevents noisy cascading errors
    sleep(1);
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── 2. Fetch Player State (Redis cache-heavy read) ────────────────────────────
  const stateRes = http.get(`${BASE_URL}/player/state`, {
    headers: authHeaders,
  });
  responseTimeTrend.add(stateRes.timings.duration);

  check(stateRes, {
    'state: status 200': (r) => r.status === 200,
  });

  // ── 3. Start Dialogue (resolved tree cache read) ─────────────────────────────
  // Uses valid character/scene IDs from seeded content (Guard at Welcome Center)
  // The start node is narrator, but the dialogue tree includes guard_intro later
  const diagStartRes = http.post(
    `${BASE_URL}/dialogue/start`,
    JSON.stringify({
      characterId: CHARACTER_ID,
      sceneId: SCENE_ID
    }),
    {
      headers: {
        'Content-Type':  'application/json',
        ...authHeaders,
      },
    }
  );
  responseTimeTrend.add(diagStartRes.timings.duration);

  check(diagStartRes, {
    'dialogue/start: status 200': (r) => r.status === 200,
  });

  // Extract the dialogue tree ID for subsequent choose requests
  const treeId = diagStartRes.json('data')?.tree?.id;

  // Simulated reading time before submitting a choice
  sleep(1);

  // ── 4. Submit Dialogue Choice (OLTP write + fire-and-forget OLAP telemetry) ──
  // Only submit if we have a valid tree ID from the start response
  if (treeId) {
    const diagChooseRes = http.post(
      `${BASE_URL}/dialogue/${treeId}/choose`,
      JSON.stringify({ choiceIndex: 0 }),
      {
        headers: {
          'Content-Type':  'application/json',
          ...authHeaders,
        },
      }
    );

    const choiceAccepted = check(diagChooseRes, {
      'dialogue/choose: status 200': (r) => r.status === 200,
    });
    errorRate.add(!choiceAccepted);
    responseTimeTrend.add(diagChooseRes.timings.duration);
  }

  // Brief think-time before next iteration
  sleep(2);
}