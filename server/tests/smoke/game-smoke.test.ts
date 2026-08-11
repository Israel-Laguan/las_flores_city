import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerGameRoutes } from '../../src/routes/gameRoutes.js';

/**
 * Smoke test for the slim game-server process (M21).
 *
 * Verifies route isolation: the game-server exposes ONLY player-facing
 * game routes. It must NOT mount any `admin-*` / intake routes.
 */
describe('Smoke: game-server process', () => {
  const app = createApp(registerGameRoutes);

  test('/health responds with game-server identity', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('las-flores-server');
  });

  test('game route exists (player/state returns 401, not 404)', async () => {
    const res = await request(app).get('/player/state');
    // Not 404 means the route is mounted; 401 is expected without auth.
    expect(res.status).not.toBe(404);
  });

  test('admin route is absent on game-server (404)', async () => {
    const res = await request(app).get('/admin/stats');
    expect(res.status).toBe(404);
  });

  test('intake-only asset-generation route is absent on game-server (404)', async () => {
    const res = await request(app).get('/admin/story-builder/plans');
    expect(res.status).toBe(404);
  });
});
