/**
 * API Contract E2E — Cookie Authentication (Task 6.5 migration)
 *
 * This is a pure-API contract suite: it verifies the server's endpoint shapes
 * directly against :3000, with no browser/page. It was migrated from the
 * legacy Bearer-token pattern (`Authorization: Bearer <token>`) to cookie auth
 * so that our primary contract test exercises the production auth pathway
 * (HttpOnly `jwt_session` cookie) rather than a dev fallback.
 *
 * Mechanism: a browserless `playwright.request.newContext()` performs login,
 * captures the resulting `Set-Cookie` via `storageState()`, and seeds a second
 * long-lived context with it. Every subsequent request then carries the cookie
 * automatically — exactly how a real API client behaves. See Task 6.5 spec
 * §E2E migration.
 *
 * NOTE on origin scoping: this suite talks to the Vite dev server at :5173
 * through the /api proxy, so the cookie is correctly scoped to :5173.
 */
import { test, expect, APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:5173';
const WELCOME_SCENE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TEST_CHARACTER_ID = '550e8400-e29b-41d4-a716-446655440004';
const TEST_EMAIL = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const TEST_USERNAME = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Long-lived authenticated context, seeded in beforeAll. Every test reuses it
// so the HttpOnly cookie rides along on each request with no per-test setup.
let apiContext: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  // 1. Register the user via a throwaway context through the Vite /api proxy.
  const regContext = await playwright.request.newContext({ baseURL: API_BASE });
  const regRes = await regContext.post('/api/auth/register', {
    data: {
      email: TEST_EMAIL,
      username: TEST_USERNAME,
      display_name: 'E2E Player',
      password: 'password123',
    },
  });
  expect(regRes.ok()).toBeTruthy();
  await regContext.dispose();

  // 2. Login in a fresh context — Playwright captures the Set-Cookie header
  //    into this context's cookie jar automatically.
  const loginContext = await playwright.request.newContext({ baseURL: API_BASE });
  const loginRes = await loginContext.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: 'password123' },
  });
  expect(loginRes.ok()).toBeTruthy();

  // 3. Export the authenticated storage state (cookies) and seed the final
  //    context with it. This is the context every test will use.
  const storageState = await loginContext.storageState();
  apiContext = await playwright.request.newContext({
    baseURL: API_BASE,
    storageState,
  });
  await loginContext.dispose();
});

test.afterAll(async () => {
  await apiContext?.dispose();
});

test.describe('API Contract E2E', () => {
  test('GET /health returns valid response', async () => {
    const response = await apiContext.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.service).toBe('las-flores-server');
  });

  test('GET /player/state returns valid player state under cookie auth', async () => {
    // No Authorization header — the cookie carries auth, proving the contract
    // works under the production pathway.
    const response = await apiContext.get('/api/player/state');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    // Contract invariant: the response must NOT leak a raw token now that auth
    // is cookie-based. See Task 6.5 spec invariant 1.
    expect(data.data.token).toBeUndefined();
    expect(data.data.userId).toBeTruthy();
    expect(data.data.username).toBeTruthy();
    expect(data.data.timeBlocks).toBeDefined();
    expect(data.data.locationId).toBeDefined();
    expect(data.data.credits).toBeDefined();
    expect(data.data.goldCredits).toBeDefined();
  });

  test('GET /location/welcome_center returns valid scene payload', async () => {
    const response = await apiContext.get(`/api/location/${WELCOME_SCENE_ID}`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);

    expect(data.data.scene).toBeDefined();
    expect(data.data.npcs).toBeDefined();
    expect(Array.isArray(data.data.npcs)).toBe(true);

    expect(data.data.scene.id).toBe(WELCOME_SCENE_ID);
    expect(data.data.scene.title).toBe('Welcome Center');
    expect(data.data.scene.backgroundUrl).toBeTruthy();
    expect(data.data.scene.mood).toBeTruthy();

    data.data.npcs.forEach((npc: any) => {
      expect(npc.characterId).toBeTruthy();
      expect(npc.name).toBeTruthy();
      expect(npc.portraitUrl).toBeTruthy();
      expect(npc.currentMood).toBeTruthy();
      expect(npc.relationship).toBeDefined();
      expect(typeof npc.relationship.friendship).toBe('number');
      expect(typeof npc.relationship.romance).toBe('number');
      expect(typeof npc.canInteract).toBe('boolean');
    });
  });

  test('POST /dialogue/start returns valid dialogue chunk', async () => {
    const response = await apiContext.post('/api/dialogue/start', {
      data: { characterId: TEST_CHARACTER_ID, sceneId: WELCOME_SCENE_ID },
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);

    // chunk-based response (replaces old tree-based response)
    expect(data.data.chunk).toBeDefined();
    expect(data.data.chunk.id).toBeTruthy();
    expect(data.data.chunk.chunk_key).toBeTruthy();
    expect(data.data.chunk.nodes).toBeDefined();
    expect(data.data.current_chunk_id).toBeDefined();
    expect(data.data.current_node_id).toBeDefined();
    expect(data.data.available_choices).toBeDefined();
    expect(data.data.available_choices.length).toBeGreaterThan(0);
  });
});
