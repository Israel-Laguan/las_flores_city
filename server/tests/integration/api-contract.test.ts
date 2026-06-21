import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { commsRouter } from '../../src/routes/comms.js';
import '../../src/routes/comms-reply.js';
import { healthRouter } from '../../src/routes/health.js';
import { playerRouter } from '../../src/routes/player.js';
import { locationRouter } from '../../src/routes/location.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { vaultRouter } from '../../src/routes/vault.js';
import { deleteCache, closeRedis } from '../../src/database/redis.js';

const { Pool } = pg;

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Migration may already be applied
  }
}

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const WELCOME_SCENE_ID = '550e8400-e29b-41d4-a716-446655440002';
const APARTMENT_SCENE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_CHARACTER_ID = '3b2b8000-e29b-41d4-a716-446655440001'; // Vance — speaker in The Awakening
const HANDLER_CHARACTER_ID = '550e8400-e29b-41d4-a716-446655440004'; // The Handler — has dialogue at Welcome Center

const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/player', playerRouter);
app.use('/location', locationRouter);
app.use('/dialogue', dialogueRouter);
app.use('/comms', commsRouter);
app.use('/vault', vaultRouter);

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

  // Apply migrations needed for resolver columns
  await applyMigration('001_initial_schema.sql');
  await applyMigration('005_dialogue_service.sql');
  await applyMigration('017_mystery_state.sql');
  await applyMigration('028_metaplot_alignment.sql');
  await applyMigration('018_vault_system.sql');
  await applyMigration('026_vault_signed_urls.sql');

  await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       updated_at = NOW()`,
    [TEST_USER_ID, 'api-contract-test@example.com', 'api_contract_test', 'API Contract Test']
  );
  await pool.query(
    `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET
       time_blocks = 48,
       credits = 100,
       current_location_id = $2,
       updated_at = NOW()`,
    [TEST_USER_ID, WELCOME_SCENE_ID]
  );
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await pool.query(
    'DELETE FROM player_sms_threads WHERE user_id = $1',
    [TEST_USER_ID]
  );
  await pool.query(
    'DELETE FROM user_relationships WHERE user_id = $1',
    [TEST_USER_ID]
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }

  await deleteCache(`user:state:${TEST_USER_ID}`);
  await pool.query('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM player_sms_threads WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM user_relationships WHERE user_id = $1', [TEST_USER_ID]);
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
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: APARTMENT_SCENE_ID }),
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
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: APARTMENT_SCENE_ID }),
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

  describe('POST /comms/start', () => {
    test('opens a new thread for a character with a dialogue tree', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('characterId', HANDLER_CHARACTER_ID);
      expect(data.data).toHaveProperty('characterName');
      expect(data.data).toHaveProperty('chatHistory');
      expect(Array.isArray(data.data.chatHistory)).toBe(true);
      expect(data.data.chatHistory.length).toBeGreaterThan(0);
      expect(data.data.chatHistory[0]).toHaveProperty('author', 'npc');
      expect(data.data.chatHistory[0]).toHaveProperty('text');
      expect(data.data.chatHistory[0]).toHaveProperty('id');
      expect(data.data).toHaveProperty('currentNodeId');
      expect(data.data).toHaveProperty('isEnd');
      expect(data.data).toHaveProperty('choices');
      expect(Array.isArray(data.data.choices)).toBe(true);
      expect(data.data).toHaveProperty('unread', true);
      expect(data.data).toHaveProperty('friendshipLevel', 0);
      expect(data.data).toHaveProperty('romanceLevel', 0);
    });

    test('is idempotent: second start returns the same thread, not a new one', async () => {
      const port = server.address().port;
      const first = await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      const firstData = await jsonResponse(first);
      const firstHistoryLen = firstData.data.chatHistory.length;

      const second = await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      const secondData = await jsonResponse(second);

      expect(second.status).toBe(200);
      expect(secondData.data).toHaveProperty('characterId', HANDLER_CHARACTER_ID);
      expect(secondData.data.chatHistory.length).toBe(firstHistoryLen);
    });

    test('returns 400 when characterId is missing', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({}),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(400);
      expect(data).toHaveProperty('success', false);
      expect(data.error).toMatch(/characterId/);
    });

    test('returns 404 for an unknown character', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: '00000000-0000-0000-0000-deadbeefcafe' }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(404);
      expect(data).toHaveProperty('success', false);
    });
  });

  describe('GET /comms/inbox', () => {
    test('returns the user\'s active threads', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/inbox`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('threads');
      expect(Array.isArray(data.data.threads)).toBe(true);
      expect(data.data.threads.length).toBeGreaterThan(0);

      const handler = data.data.threads.find((t: any) => t.characterId === HANDLER_CHARACTER_ID);
      expect(handler).toBeDefined();
      expect(handler).toHaveProperty('characterName');
      expect(handler).toHaveProperty('lastMessage');
      expect(handler).toHaveProperty('friendshipLevel');
      expect(handler).toHaveProperty('romanceLevel');
      expect(handler).toHaveProperty('unread');
    });
  });

  describe('GET /comms/thread/:characterId', () => {
    test('returns the thread detail for the character', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/thread/${HANDLER_CHARACTER_ID}`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('characterId', HANDLER_CHARACTER_ID);
      expect(Array.isArray(data.data.chatHistory)).toBe(true);
      expect(data.data.chatHistory.length).toBeGreaterThan(0);
      expect(data.data).toHaveProperty('choices');
      expect(Array.isArray(data.data.choices)).toBe(true);
    });

    test('returns 404 for a character with no thread', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/thread/00000000-0000-0000-0000-deadbeefcafe`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(404);
      expect(data).toHaveProperty('success', false);
    });
  });

  describe('POST /comms/reply', () => {
    test('appends the player message and advances the dialogue', async () => {
      const port = server.address().port;
      
      // First, ensure thread exists
      await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      
      const detail = await fetch(`http://localhost:${port}/comms/thread/${HANDLER_CHARACTER_ID}`, {
        headers: authHeaders(),
      });
      const detailData = await jsonResponse(detail);
      const firstChoice = detailData.data.choices[0];
      expect(firstChoice).toBeDefined();
      expect(firstChoice).toHaveProperty('id');

      const res = await fetch(`http://localhost:${port}/comms/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID, choiceId: firstChoice.id }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('characterId', HANDLER_CHARACTER_ID);
      expect(data.data.chatHistory.length).toBeGreaterThanOrEqual(detailData.data.chatHistory.length + 1);
      const lastMessage = data.data.chatHistory[data.data.chatHistory.length - 1];
      expect(['npc', 'player']).toContain(lastMessage.author);
    });

    test('returns 404 for a choice the user does not qualify for', async () => {
      const port = server.address().port;
      
      // First, ensure thread exists
      await fetch(`http://localhost:${port}/comms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      
      const res = await fetch(`http://localhost:${port}/comms/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID, choiceId: 'no_such_choice_id' }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(404);
      expect(data).toHaveProperty('success', false);
    });
  });

  describe('POST /comms/read', () => {
    test('returns updated row count for the thread', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: HANDLER_CHARACTER_ID }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('updated');
      expect(typeof data.data.updated).toBe('number');
    });

    test('subsequent /thread reflects unread=false', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/comms/thread/${HANDLER_CHARACTER_ID}`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data.data).toHaveProperty('unread', false);
    });
  });

  describe('GET /vault', () => {
    test('returns valid vault inventory envelope', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/vault`, {
        headers: authHeaders(),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('timestamp');
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
