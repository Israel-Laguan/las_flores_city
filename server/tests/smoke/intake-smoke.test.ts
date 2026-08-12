import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerIntakeRoutes } from '../../src/routes/intakeRoutes.js';

/**
 * Smoke test for the intake-worker process (M21).
 *
 * Verifies route isolation: the intake-worker exposes ONLY admin + content +
 * asset-generation routes. It must NOT mount player game routes.
 */
describe('Smoke: intake-worker process', () => {
  const app = createApp(registerIntakeRoutes);

  test('/health responds with intake-worker identity', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Same health router mounts on both; the process name differs in logs,
    // but the endpoint payload is shared. We assert the endpoint is present.
    expect(res.body.data.service).toBe('las-flores-server');
  });

  test('admin route exists on intake-worker (returns 401, not 404)', async () => {
    const res = await request(app).get('/admin/stats');
    // 401 is expected without auth; 404 would mean the route is not mounted.
    expect(res.status).toBe(401);
  });

  test('player route is absent on intake-worker (404)', async () => {
    const res = await request(app).get('/player/state');
    expect(res.status).toBe(404);
  });

  test('game-only vault route is absent on intake-worker (404)', async () => {
    const res = await request(app).get('/vault/balance');
    expect(res.status).toBe(404);
  });
});
