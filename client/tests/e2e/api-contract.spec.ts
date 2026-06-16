import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const WELCOME_SCENE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TEST_CHARACTER_ID = '550e8400-e29b-41d4-a716-446655440004';
const TEST_EMAIL = `e2e-${Date.now()}@example.com`;
let authToken = '';

test.beforeAll(async ({ request }) => {
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email: TEST_EMAIL,
      username: `e2e_${Date.now()}`,
      display_name: 'E2E Player',
      password: 'password123',
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  authToken = data.data.token;
});

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

test.describe('API Contract E2E', () => {
  test('GET /health returns valid response', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.service).toBe('las-flores-server');
  });

  test('GET /player/state returns valid player state', async ({ request }) => {
    const response = await request.get(`${API_BASE}/player/state`, {
      headers: authHeaders(),
    });
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.userId).toBeTruthy();
    expect(data.data.username).toBeTruthy();
    expect(data.data.timeBlocks).toBeDefined();
    expect(data.data.locationId).toBeDefined();
    expect(data.data.credits).toBeDefined();
    expect(data.data.goldCredits).toBeDefined();
  });

  test('GET /location/welcome_center returns valid scene payload', async ({ request }) => {
    const response = await request.get(`${API_BASE}/location/${WELCOME_SCENE_ID}`, {
      headers: authHeaders(),
    });
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

  test('POST /dialogue/start returns valid dialogue tree', async ({ request }) => {
    const response = await request.post(`${API_BASE}/dialogue/start`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      data: { characterId: TEST_CHARACTER_ID, sceneId: WELCOME_SCENE_ID },
    });
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.tree).toBeDefined();
    expect(data.data.tree.name).toBeTruthy();
    expect(data.data.tree.start_node_id).toBeTruthy();
    expect(data.data.tree.nodes).toBeDefined();
    expect(data.data.current_node).toBeDefined();
    expect(data.data.available_choices).toBeDefined();
    expect(data.data.available_choices.length).toBeGreaterThan(0);
  });
});
