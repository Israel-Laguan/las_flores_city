/**
 * Integration tests for asset cascade resolution (Milestone 07).
 *
 * Verifies that the env-aware stage resolver picks the correct URL
 * for characters (portrait_urls) and scenes (background_urls).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import yaml from 'js-yaml';
import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { deleteCache, closeRedis } from '../../src/database/redis.js';
import { authMiddleware, AuthRequest, generateToken } from '../../src/middleware/auth.js';
import { locationRouter } from '../../src/routes/location.js';

// Collision-avoidance: these UUIDs use reserved high-value prefixes that
// cannot collide with gen_random_uuid() values in production data.
const TEST_USER_ID = '00000000-0000-0000-0000-000000000099';
const TEST_SCENE_ID = '10000000-0000-0000-0000-000000000001';
const TEST_CHARACTER_ID = '20000000-0000-0000-0000-000000000001';
const TEST_DISTRICT_ID = '30000000-0000-0000-0000-000000000001';

const app = express();
app.use(express.json());
app.use('/location', locationRouter);

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

beforeAll(async () => {
  // Create test user
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'cascade-test@example.com', 'cascade_test', 'Cascade Test')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [TEST_USER_ID]
  );

  // Ensure districts exist
  await queryOLTP(
    `INSERT INTO districts (id, name, slug, x, y) VALUES ($1, 'Cascade Test District', 'cascade-test-district', 0, 0) ON CONFLICT (id) DO NOTHING`,
    [TEST_DISTRICT_ID]
  );
});

afterAll(async () => {
  // Delete player_states first (FK to scenes and users), then scenes + characters, then users
  await queryOLTP('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM scene_characters WHERE scene_id = $1', [TEST_SCENE_ID]);
  await queryOLTP('DELETE FROM scenes WHERE id = $1', [TEST_SCENE_ID]);
  await queryOLTP('DELETE FROM characters WHERE id = $1', [TEST_CHARACTER_ID]);
  await queryOLTP('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM districts WHERE id = $1', [TEST_DISTRICT_ID]);
  await deleteCache(`scene:global:${TEST_SCENE_ID}`);
  await deleteCache(`user:location:${TEST_USER_ID}:${TEST_SCENE_ID}`);
  await closeConnections();
  await closeRedis();
});

describe('Asset cascade resolution', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('character portrait cascade', () => {
    it('in development: character with all three stage entries returns dev URL', async () => {
      process.env.NODE_ENV = 'development';

      // Create character with all stage entries
      await queryOLTP(
        `INSERT INTO characters (id, name, description, portrait_urls)
         VALUES ($1, 'Cascade Character', 'Cascade test character', $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           portrait_urls = EXCLUDED.portrait_urls`,
        [TEST_CHARACTER_ID, JSON.stringify([
          { url: 'https://dev.example.com/portrait.png', label: 'dev' },
          { url: 'https://staging.example.com/portrait.png', label: 'staging' },
          { url: 'https://prod.example.com/portrait.png', label: 'production' },
        ])]
      );

      // Create scene with the character
      await queryOLTP(
        `INSERT INTO scenes (id, name, description, district_id, background_url)
         VALUES ($1, 'Cascade Scene', 'Test', $2, 'https://legacy.example.com/bg.png')
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [TEST_SCENE_ID, TEST_DISTRICT_ID]
      );
      await queryOLTP(
        `INSERT INTO scene_characters (scene_id, character_id, is_permanent, default_mood)
         VALUES ($1, $2, true, 'neutral')
         ON CONFLICT (scene_id, character_id) DO NOTHING`,
        [TEST_SCENE_ID, TEST_CHARACTER_ID]
      );

      // Create player state
      await queryOLTP(
        `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
         VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
         ON CONFLICT (user_id) DO UPDATE SET current_location_id = $2, story_beat = 'prologue'`,
        [TEST_USER_ID, TEST_SCENE_ID]
      );

      const res = await request(app)
        .get(`/location/${TEST_SCENE_ID}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const npc = res.body.data.npcs.find((n: any) => n.characterId === TEST_CHARACTER_ID);
      expect(npc).toBeDefined();
      expect(npc.portraitUrl).toBe('https://dev.example.com/portrait.png');
    });

    it('in production: same character returns production URL', async () => {
      process.env.NODE_ENV = 'production';

      // Invalidate user-specific cache from test 1 (which cached dev URLs)
      await deleteCache(`user:location:${TEST_USER_ID}:${TEST_SCENE_ID}`);

      // Character from previous test still exists with all three entries
      const res = await request(app)
        .get(`/location/${TEST_SCENE_ID}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      const npc = res.body.data.npcs.find((n: any) => n.characterId === TEST_CHARACTER_ID);
      expect(npc).toBeDefined();
      expect(npc.portraitUrl).toBe('https://prod.example.com/portrait.png');
    });
  });

  describe('scene background cascade', () => {
    it('scene with background_urls returns env-appropriate backgroundUrl', async () => {
      process.env.NODE_ENV = 'development';

      await queryOLTP(
        `UPDATE scenes SET background_urls = $1::jsonb WHERE id = $2`,
        [JSON.stringify([
          { url: 'https://dev.example.com/scene-bg.png', label: 'dev' },
          { url: 'https://staging.example.com/scene-bg.png', label: 'staging' },
          { url: 'https://prod.example.com/scene-bg.png', label: 'production' },
        ]), TEST_SCENE_ID]
      );

      // Clear cache
      await deleteCache(`scene:global:${TEST_SCENE_ID}`);
      await deleteCache(`user:location:${TEST_USER_ID}:${TEST_SCENE_ID}`);

      const res = await request(app)
        .get(`/location/${TEST_SCENE_ID}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data.scene.backgroundUrl).toBe('https://dev.example.com/scene-bg.png');
    });

    it('scene with only legacy background_url still resolves', async () => {
      // Remove background_urls, keep legacy background_url
      await queryOLTP(
        `UPDATE scenes SET background_urls = NULL, background_url = 'https://legacy.example.com/bg.png' WHERE id = $1`,
        [TEST_SCENE_ID]
      );

      await deleteCache(`scene:global:${TEST_SCENE_ID}`);
      await deleteCache(`user:location:${TEST_USER_ID}:${TEST_SCENE_ID}`);

      const res = await request(app)
        .get(`/location/${TEST_SCENE_ID}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data.scene.backgroundUrl).toBe('https://legacy.example.com/bg.png');
    });

    it('scene with no background_urls and no background_url uses default', async () => {
      await queryOLTP(
        `UPDATE scenes SET background_urls = NULL, background_url = NULL WHERE id = $1`,
        [TEST_SCENE_ID]
      );

      await deleteCache(`scene:global:${TEST_SCENE_ID}`);
      await deleteCache(`user:location:${TEST_USER_ID}:${TEST_SCENE_ID}`);

      const res = await request(app)
        .get(`/location/${TEST_SCENE_ID}`)
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data.scene.backgroundUrl).toBe('/assets/scenes/default/background.png');
    });
  });
});
