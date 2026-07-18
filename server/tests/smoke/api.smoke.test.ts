/**
 * HTTP API smoke tests (derived from scripts/validate-milestones.sh).
 *
 * Verifies live HTTP endpoints return valid responses.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import pg from 'pg';
import http from 'http';
import express from 'express';
import request, { SuperTest, Test } from 'supertest';
import { healthRouter } from '../../src/routes/health.js';
import { locationRouter } from '../../src/routes/location.js';
import { adminContentAssetRouter } from '../../src/routes/admin-content-asset.js';
import { generateToken } from '../../src/middleware/auth.js';

const { Pool } = pg;

// Collision-avoidance: these UUIDs use reserved high-value prefixes
const TEST_USER_ID = '00000000-0000-0000-0000-000000009999';
const TEST_SCENE_ID = '10000000-0000-0000-0000-000000009999';
const TEST_CHARACTER_ID = '20000000-0000-0000-0000-000000009999';
const TEST_DISTRICT_ID = '30000000-0000-0000-0000-000000009999';

// DB handle
let pool: pg.Pool;

// Test app + explicit server (reused across requests so it can be closed cleanly)
let app: express.Application;
let server: http.Server;
let agent: SuperTest<Test>;

// Wraps supertest requests against the shared server instance.
const api = (method: 'get' | 'post' | 'put' | 'delete' | 'patch', url: string) =>
  agent[method](url);

beforeAll(() => {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  // Build test app
  app = express();
  app.use(express.json());
  // Mock /api stripping middleware (index.ts line 105-110)
  app.use((req, _res, next) => {
    if (req.url.startsWith('/api/')) {
      req.url = req.url.slice(4);
    }
    next();
  });
  // Mount health router (public)
  app.use('/health', healthRouter);
  // Mount location router with mock auth
  app.use((req, _res, next) => {
    req.userId = TEST_USER_ID;
    next();
  });
  app.use('/location', locationRouter);
  // Mount admin-content-asset router with mock admin auth
  app.use((req, _res, next) => {
    req.userId = TEST_USER_ID;
    next();
  });
  app.use('/admin/content', adminContentAssetRouter);

  // Create a single HTTP server for supertest to reuse and close cleanly.
  server = http.createServer(app);
  // Use supertest.agent() to reuse the same connection pool and close properly.
  agent = request.agent(server);
});

beforeEach(async () => {
  // Create test user with admin role
  await pool.query(
    `INSERT INTO users (id, email, username, display_name, role)
     VALUES ($1, 'smoke-test@example.com', 'smoke_test', 'Smoke Test', 'admin')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [TEST_USER_ID],
  );
  // Ensure district exists
  await pool.query(
    `INSERT INTO districts (id, name, slug, x, y)
     VALUES ($1, 'Smoke Test District', 'smoke-test', 0, 0)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_DISTRICT_ID],
  );
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try {
    await pool.query('DELETE FROM scene_characters WHERE scene_id = $1', [TEST_SCENE_ID]);
    await pool.query('DELETE FROM scenes WHERE id = $1', [TEST_SCENE_ID]);
    await pool.query('DELETE FROM characters WHERE id = $1', [TEST_CHARACTER_ID]);
    await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
    await pool.query('DELETE FROM districts WHERE id = $1', [TEST_DISTRICT_ID]);
  } catch (err) {
    console.error('api.smoke cleanup error:', err);
  } finally {
    await pool.end();
  }
});

describe('Smoke: HTTP endpoints', () => {
  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const res = await api('get', '/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('GET /api/location/:id (portrait URL resolution)', () => {
    beforeEach(async () => {
      // Create a scene with an NPC that has portrait_urls
      await pool.query(
        `INSERT INTO scenes (id, name, description, district_id)
         VALUES ($1, 'Smoke Scene', 'Test scene for smoke', $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [TEST_SCENE_ID, TEST_DISTRICT_ID],
      );
      await pool.query(
        `INSERT INTO characters (id, name, description, portrait_urls)
         VALUES ($1, 'Smoke Character', 'Test character', $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET portrait_urls = EXCLUDED.portrait_urls`,
        [TEST_CHARACTER_ID, JSON.stringify([
          { url: 'https://dev.example.com/portrait.png', label: 'dev' },
          { url: 'https://staging.example.com/portrait.png', label: 'staging' },
          { url: 'https://prod.example.com/portrait.png', label: 'production' },
        ])],
      );
      await pool.query(
        `INSERT INTO scene_characters (scene_id, character_id, is_permanent)
         VALUES ($1, $2, true)
         ON CONFLICT DO NOTHING`,
        [TEST_SCENE_ID, TEST_CHARACTER_ID],
      );
    });

    it('returns portraitUrl in NPC payload', async () => {
      const token = generateToken(TEST_USER_ID);
      const res = await api('get', `/api/location/${TEST_SCENE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.npcs).toBeDefined();
      // At least one NPC should have portraitUrl
      const npc = res.body.data.npcs.find((n: any) => n.characterId === TEST_CHARACTER_ID);
      expect(npc).toBeDefined();
      expect(npc.portraitUrl).toBeDefined();
      // In development, dev URL should be selected
      expect(npc.portraitUrl).toContain('https://');
    });
  });

  describe('GET /admin/content/assets/promotion-status', () => {
    it('returns HTTP 200 with promotion status data', async () => {
      const token = generateToken(TEST_USER_ID);
      const res = await api('get', '/admin/content/assets/promotion-status')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});