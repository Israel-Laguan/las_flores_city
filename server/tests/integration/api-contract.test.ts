import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import { healthRouter } from '../../src/routes/health.js';
import { playerRouter } from '../../src/routes/player.js';
import { locationRouter } from '../../src/routes/location.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const WELCOME_SCENE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TEST_CHARACTER_ID = '3b2b8000-e29b-41d4-a716-446655440001'; // Vance — speaker in The Awakening at WELCOME_SCENE_ID

const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/player', playerRouter);
app.use('/location', locationRouter);
app.use('/dialogue', dialogueRouter);

let server: any;
let pool: pg.Pool;

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

async function jsonResponse(res: Response): Promise<any> {
  return res.json();
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
    connectionTimeoutMillis: 5000,
  });

  await pool.query(
    `INSERT INTO users (id, email, username, display_name, time_blocks)
     VALUES ($1, $2, $3, $4, 48)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       time_blocks = 48,
       updated_at = NOW()`,
    [TEST_USER_ID, 'api-contract-test@example.com', 'api_contract_test', 'API Contract Test']
  );
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS active_dialogue_id UUID REFERENCES dialogue_trees(id)'
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }

  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await pool.end();
  await closeRedis();
});

describe('API Contract Tests', () => {
  describe('GET /health', () => {
    test('returns valid health response', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/health`);
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('timestamp');
      expect(data.data).toHaveProperty('status', 'healthy');
      expect(data.data).toHaveProperty('service', 'las-flores-server');
      expect(data.data).toHaveProperty('version');
    });
  });

  describe('GET /player/state', () => {
    test('returns valid player state', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/player/state`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('timestamp');
      expect(data.data).toHaveProperty('userId', TEST_USER_ID);
      expect(data.data).toHaveProperty('username', 'api_contract_test');
      expect(data.data).toHaveProperty('locationId');
      expect(data.data).toHaveProperty('timeBlocks');
      expect(data.data).toHaveProperty('credits');
      expect(data.data).toHaveProperty('goldCredits');
      expect(data.data).toHaveProperty('currentNodeId');
      expect(data.data).toHaveProperty('lastLogin');
      expect(data.data).toHaveProperty('createdAt');
      expect(data.data).toHaveProperty('updatedAt');
    });
  });

  describe('GET /health/player-state', () => {
    test('returns valid player state health endpoint', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/health/player-state`);
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('time_blocks');
      expect(data.data.time_blocks).toHaveProperty('current_blocks');
      expect(data.data.time_blocks).toHaveProperty('max_blocks');
    });
  });

  describe('GET /location/:id', () => {
    test('returns valid scene payload for welcome_center', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/location/${WELCOME_SCENE_ID}`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('scene');
      expect(data.data).toHaveProperty('npcs');
      expect(Array.isArray(data.data.npcs)).toBe(true);
      expect(data.data.scene).toHaveProperty('id', WELCOME_SCENE_ID);
      expect(data.data.scene).toHaveProperty('title');
      expect(data.data.scene).toHaveProperty('backgroundUrl');
      expect(data.data.scene).toHaveProperty('ambientSoundUrl');
      expect(data.data.scene).toHaveProperty('mood');
      data.data.npcs.forEach((npc: any) => {
        expect(npc).toHaveProperty('characterId');
        expect(npc).toHaveProperty('name');
        expect(npc).toHaveProperty('portraitUrl');
        expect(npc).toHaveProperty('currentMood');
        expect(npc).toHaveProperty('relationship');
        expect(npc.relationship).toHaveProperty('friendship');
        expect(npc.relationship).toHaveProperty('romance');
        expect(npc).toHaveProperty('canInteract');
      });
    });
  });

  describe('GET /location/:id/dialogues', () => {
    test('returns dialogues for a location', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/location/${WELCOME_SCENE_ID}/dialogues`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('location_id');
      expect(Array.isArray(data.data.dialogues)).toBe(true);
    });
  });

  describe('POST /dialogue/start', () => {
    test('returns valid dialogue tree', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/dialogue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: WELCOME_SCENE_ID }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(201);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('tree');
      expect(data.data).toHaveProperty('current_node');
      expect(data.data).toHaveProperty('available_choices');
      expect(Array.isArray(data.data.available_choices)).toBe(true);
      expect(data.data.available_choices.length).toBeGreaterThan(0);

      const tree = data.data.tree;
      expect(tree).toHaveProperty('id');
      expect(tree).toHaveProperty('name');
      expect(tree).toHaveProperty('start_node_id');
      expect(tree).toHaveProperty('nodes');
      expect(typeof tree.nodes).toBe('object');

      const currentNode = data.data.current_node;
      expect(currentNode).toHaveProperty('id');
      expect(currentNode).toHaveProperty('type');
      expect(currentNode).toHaveProperty('text');
    });
  });

  describe('POST /dialogue/:id/choose', () => {
    test('returns valid choice response', async () => {
      const port = server.address().port;
      const start = await fetch(`http://localhost:${port}/dialogue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: WELCOME_SCENE_ID }),
      });
      const startData = await jsonResponse(start);
      const res = await fetch(`http://localhost:${port}/dialogue/${startData.data.tree.id}/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ choiceIndex: 0 }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('dialogue_id', startData.data.tree.id);
      expect(data.data).toHaveProperty('choice_index', 0);
      expect(data.data).toHaveProperty('next_node');
      expect(data.data.next_node).toHaveProperty('id');
      expect(data.data.next_node).toHaveProperty('text');
      expect(data.data).toHaveProperty('time_blocks_spent');
      expect(typeof data.data.time_blocks_spent).toBe('number');
    });
  });
});
