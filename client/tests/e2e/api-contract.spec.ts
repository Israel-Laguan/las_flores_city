import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

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
    const response = await request.get(`${API_BASE}/player/state`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.user_id).toBeTruthy();
    expect(data.data.time_blocks).toBeDefined();
    expect(data.data.time_blocks.current_blocks).toBeDefined();
    expect(data.data.time_blocks.max_blocks).toBeDefined();
    expect(Array.isArray(data.data.inventory)).toBe(true);
    expect(Array.isArray(data.data.discovered_locations)).toBe(true);
  });

  test('GET /location/welcome_center returns valid location', async ({ request }) => {
    const response = await request.get(`${API_BASE}/location/welcome_center`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Welcome Center');
    expect(data.data.district).toBe('Downtown');
    expect(data.data.description).toBeTruthy();
    expect(Array.isArray(data.data.available_dialogues)).toBe(true);
  });

  test('GET /dialogue/welcome_dialogue returns valid dialogue tree', async ({ request }) => {
    const response = await request.get(`${API_BASE}/dialogue/welcome_dialogue`);
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
