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
    // Requirement 15.1: full chunk-based envelope contract
    test('returns full chunk-based envelope (Req 15.1)', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/dialogue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: APARTMENT_SCENE_ID }),
      });
      const data = await jsonResponse(res);

      expect(res.status).toBe(201);
      expect(data).toHaveProperty('success', true);

      // ── Top-level envelope fields (Req 15.1) ──────────────────
      const d = data.data;
      expect(d).toHaveProperty('current_chunk_id');
      expect(typeof d.current_chunk_id).toBe('string');
      expect(d.current_chunk_id).toBeTruthy();

      expect(d).toHaveProperty('current_node_id');
      expect(typeof d.current_node_id).toBe('string');
      expect(d.current_node_id).toBeTruthy();

      expect(d).toHaveProperty('available_choices');
      expect(Array.isArray(d.available_choices)).toBe(true);

      expect(d).toHaveProperty('is_end');
      expect(typeof d.is_end).toBe('boolean');

      expect(d).toHaveProperty('time_blocks_spent');
      expect(typeof d.time_blocks_spent).toBe('number');

      expect(d).toHaveProperty('time_blocks_remaining');
      expect(typeof d.time_blocks_remaining).toBe('number');

      // ── chunk sub-object (Req 15.1) ───────────────────────────
      const chunk = d.chunk;
      expect(chunk).toBeDefined();
      expect(typeof chunk.id).toBe('string');
      expect(chunk.id).toBeTruthy();
      expect(typeof chunk.chunk_key).toBe('string');
      expect(chunk.chunk_key).toBeTruthy();
      expect(chunk.nodes).toBeDefined();
      expect(typeof chunk.nodes).toBe('object');
      expect(chunk.leaves).toBeDefined();
      expect(typeof chunk.leaves).toBe('object');

      // current_node_id must point to a node inside the chunk
      expect(chunk.nodes).toHaveProperty(d.current_node_id);
      expect(d.current_chunk_id).toBe(chunk.id);

      // ── Payload-stripping: no GUARDED leaf may expose target_chunk ──
      // (Requirement 9.5 / Requirement 15.1 hardening)
      for (const [, leaf] of Object.entries(chunk.leaves as Record<string, any>)) {
        if (leaf.type === 'GUARDED') {
          expect(leaf).not.toHaveProperty('target_chunk');
        }
        if (leaf.type === 'FREE') {
          expect(leaf).toHaveProperty('target_chunk');
        }
      }

      // ── Requirement 15.3: no legacy tree-format fields ────────
      expect(d.tree).toBeUndefined();
      expect(d.nodes).toBeUndefined();
    });
  });

  describe('POST /dialogue/:id/choose', () => {
    // Requirement 15.2: full chunk-based choose envelope contract
    test('returns full chunk-based choose envelope (Req 15.2)', async () => {
      const port = server.address().port;

      // ── Start a fresh dialogue ─────────────────────────────────
      const start = await fetch(`http://localhost:${port}/dialogue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: TEST_CHARACTER_ID, sceneId: APARTMENT_SCENE_ID }),
      });
      const startData = await jsonResponse(start);
      expect(start.status).toBe(201);

      const currentChunkId = startData.data.current_chunk_id;

      // Requirement 15.2: the route param must be the dialogue/tree UUID, not the chunk UUID
      const treeId = startData.data.dialogue_id ?? startData.data.chunk.id;
      expect(typeof treeId).toBe('string');

      const choices = startData.data.available_choices;
      expect(choices.length).toBeGreaterThan(0);
      const firstChoice = choices[0];
      expect(firstChoice).toHaveProperty('id');

      // ── Make the choice ────────────────────────────────────────
      const res = await fetch(`http://localhost:${port}/dialogue/${treeId}/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: firstChoice.id }),
      });
      const data = await jsonResponse(res);

      if (res.status !== 200 || !data?.success) {
        throw new Error(`[choose-debug] status=${res.status} body=${JSON.stringify(data)} treeId=${treeId} chunkId=${currentChunkId} choice=${firstChoice.id}`);
      }
      expect(data).toHaveProperty('success', true);

      const d = data.data;

      // ── Required top-level fields (Req 15.2) ──────────────────
      expect(d).toHaveProperty('dialogue_id');
      expect(typeof d.dialogue_id).toBe('string');

      expect(d).toHaveProperty('choice_id', firstChoice.id);

      expect(d).toHaveProperty('current_chunk_id');
      expect(typeof d.current_chunk_id).toBe('string');
      expect(d.current_chunk_id).toBeTruthy();

      expect(d).toHaveProperty('current_node_id');
      expect(typeof d.current_node_id).toBe('string');
      expect(d.current_node_id).toBeTruthy();

      expect(d).toHaveProperty('available_choices');
      expect(Array.isArray(d.available_choices)).toBe(true);

      expect(d).toHaveProperty('is_end');
      expect(typeof d.is_end).toBe('boolean');

      expect(d).toHaveProperty('time_blocks_spent');
      expect(typeof d.time_blocks_spent).toBe('number');

      expect(d).toHaveProperty('time_blocks_remaining');
      expect(typeof d.time_blocks_remaining).toBe('number');

      expect(d).toHaveProperty('is_chunk_boundary_crossing');
      expect(typeof d.is_chunk_boundary_crossing).toBe('boolean');

      // ── next_chunk sub-object (Req 15.2) ──────────────────────
      const nextChunk = d.next_chunk;
      expect(nextChunk).toBeDefined();
      expect(typeof nextChunk.id).toBe('string');
      expect(nextChunk.id).toBeTruthy();
      expect(typeof nextChunk.chunk_key).toBe('string');
      expect(nextChunk.chunk_key).toBeTruthy();
      expect(nextChunk.nodes).toBeDefined();
      expect(typeof nextChunk.nodes).toBe('object');
      expect(nextChunk.leaves).toBeDefined();
      expect(typeof nextChunk.leaves).toBe('object');

      // current_node_id must point to a node inside next_chunk
      expect(nextChunk.nodes).toHaveProperty(d.current_node_id);
      expect(d.current_chunk_id).toBe(nextChunk.id);

      // ── Payload-stripping: no GUARDED leaf may expose target_chunk ──
      // (Requirement 9.5 / Requirement 15.2 hardening)
      for (const [, leaf] of Object.entries(nextChunk.leaves as Record<string, any>)) {
        if (leaf.type === 'GUARDED') {
          expect(leaf).not.toHaveProperty('target_chunk');
        }
        if (leaf.type === 'FREE') {
          expect(leaf).toHaveProperty('target_chunk');
        }
      }

      // ── Requirement 15.3: no legacy tree-format fields ────────
      expect(d.tree).toBeUndefined();
      expect(d.nodes).toBeUndefined();
      expect(d.next_node).toBeUndefined();
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
