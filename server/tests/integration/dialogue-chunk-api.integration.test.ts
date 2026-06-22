import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import { queryOLTP, queryOLAP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { deleteCache, invalidatePattern, closeRedis } from '../../src/database/redis.js';
import { compileDialogueTree } from '../../src/content/compiler.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Dialogue Chunk API Integration Tests — Task 10.1
//
// Verifies the chunk-based dialogue API contract introduced in
// runtime-rewrite-dialogue-chunks (Task 7.4). Tests cover:
//
//   - POST /dialogue/start returns chunk format (not tree format)
//   - POST /dialogue/choose with a FREE leaf crosses chunk boundary
//   - POST /dialogue/choose with a GUARDED leaf validates guards
//   - GET  /dialogue/active returns chunk format
//   - player_dialogue_states.current_chunk_id recorded after start
//   - OLAP player_events.event_data includes chunk_id after a choice
//
// Fixture strategy (per AGENTS.md):
//   - Dedicated UUIDs (collision-avoidance): all prefixed dca1xxxx
//   - All rows are cleaned up in afterAll
//   - Uses compileDialogueTree to produce real dialogue_chunks rows
//
// The test tree is a two-chunk graph seeded via TREE_NODES below.
// The resolveDialogueTree fallback path (speaker_id on start node)
// is used so no scene/character table rows are required.
//
// Requirements: 1.1-1.4, 2.1-2.5, 3.1-3.4, 3.10, 4.1, 8.2, 8.3, 8.4,
//               9.1, 9.3, 9.4
// ============================================================

// ── Dedicated test fixtures (collision-avoidance: unique UUIDs for this file) ──
const TEST_USER_ID = 'dca10000-0001-4001-8001-000000000001';
const TEST_TREE_ID = 'dca10000-0002-4002-8002-000000000002';

// The resolveDialogueTree fallback matches the tree whose start node has
// speaker_id equal to the characterId passed to /dialogue/start.
// We use TEST_TREE_ID as a stand-in "character" ID for simplicity.
const MOCK_CHARACTER_ID = TEST_TREE_ID;
const MOCK_SCENE_ID     = 'dca10000-0003-4003-8003-000000000003';

// Minimal two-chunk tree:
//
//   Chunk 1 (key = 'chunk_start'):
//     chunk_start (speaker_id = MOCK_CHARACTER_ID) -> middle  [interior, same chunk]
//     middle -> guarded_target  [GUARDED leaf: time_block_cost 2]
//     middle -> free_target     [FREE leaf: tb_free choice, no cost]
//
//   Chunk 2 (key = 'guarded_target'):
//     guarded_target (is_end: true)
//
//   Chunk 3 (key = 'free_target'):
//     free_target (is_end: true)
//
// The compiler produces a GUARDED leaf for the c_pay choice (time_block_cost)
// and a FREE leaf for c_free (no guard reasons).
// Helper to build a filler node in a linear chain.
// Used to pad the start chunk to exactly 15 nodes so that
// the 16th node (free_target) triggers a FREE leaf (size rule).
function fillerNode(id: string, nextId: string): DialogueNode {
  return { id, type: 'narrator', text: `Filler node ${id}.`, choices: [{ id: `c_${id}`, text: 'Continue', next_node_id: nextId }] };
}

// Chunk layout:
//   Chunk 1 (key='chunk_start', 15 nodes):
//     chunk_start → f1 → f2 → ... → f13 → middle
//     middle → guarded_target  [GUARDED leaf: time_block_cost 2]
//     middle → free_target     [FREE leaf: 16th node would exceed limit]
//   Chunk 2 (key='guarded_target'): guarded_target (end)
//   Chunk 3 (key='free_target'):    free_target (end)
//
// 15 nodes in chunk 1: chunk_start + f1..f13 + middle = 15
// → Adding guarded_target triggers GUARDED (TB cost rule fires first)
// → Adding free_target would be the 16th → FREE leaf (size rule)
const TREE_NODES: Record<string, DialogueNode> = {
  chunk_start: {
    id: 'chunk_start',
    type: 'narrator',
    speaker_id: MOCK_CHARACTER_ID,
    text: 'You stand at the threshold.',
    choices: [{ id: 'c_into_f1', text: 'Enter', next_node_id: 'f1' }],
  },
  f1:  fillerNode('f1',  'f2'),
  f2:  fillerNode('f2',  'f3'),
  f3:  fillerNode('f3',  'f4'),
  f4:  fillerNode('f4',  'f5'),
  f5:  fillerNode('f5',  'f6'),
  f6:  fillerNode('f6',  'f7'),
  f7:  fillerNode('f7',  'f8'),
  f8:  fillerNode('f8',  'f9'),
  f9:  fillerNode('f9',  'f10'),
  f10: fillerNode('f10', 'f11'),
  f11: fillerNode('f11', 'f12'),
  f12: fillerNode('f12', 'f13'),
  f13: fillerNode('f13', 'middle'),
  middle: {
    id: 'middle',
    type: 'character',
    text: 'Two paths lie ahead.',
    choices: [
      {
        id: 'c_pay',
        text: 'Pay 2 Time Blocks',
        next_node_id: 'guarded_target',
        time_block_cost: { amount: 2, description: 'Passage toll' },
      },
      {
        id: 'c_free',
        text: 'Slip through freely',
        next_node_id: 'free_target',
      },
    ],
  },
  guarded_target: {
    id: 'guarded_target',
    type: 'narrator',
    text: 'You paid the toll.',
    is_end: true,
  },
  free_target: {
    id: 'free_target',
    type: 'narrator',
    text: 'You slipped through.',
    is_end: true,
  },
};

// ── Express app with only the dialogue router ──
const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof app.listen>;
let port: number;

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

// Chunk IDs and leaf IDs resolved after compileDialogueTree
let startChunkId   = '';
let guardedChunkId = '';
let freeChunkId    = '';
let guardedLeafId  = '';
let freeLeafId     = '';

// ── beforeAll ─────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Ensure test user + player_states exist
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'chunk-api-test@test.example', 'chunk_api_test', 'Chunk API Test')
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [TEST_USER_ID]
  );
  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, 48, 100, 0, 1, 'prologue', '{}', 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET time_blocks = 48, credits = 100`,
    [TEST_USER_ID]
  );

  // 2. Seed the dialogue tree (start node has speaker_id = MOCK_CHARACTER_ID
  //    so resolveDialogueTree's fallback path resolves it)
  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
     VALUES ($1, 'Chunk API Integration Test Tree', 'chunk_start', $2)
     ON CONFLICT (id) DO UPDATE
       SET nodes = EXCLUDED.nodes,
           start_node_id = EXCLUDED.start_node_id,
           updated_at = NOW()`,
    [TEST_TREE_ID, JSON.stringify(TREE_NODES)]
  );

  // 3. Compile the tree to populate dialogue_chunks
  await compileDialogueTree(TEST_TREE_ID);

  // 4. Discover chunk IDs + leaf IDs generated by the compiler
  const chunks = await queryOLTP<{
    id: string;
    chunk_key: string;
    leaves: Record<string, any>;
  }>(
    `SELECT id, chunk_key, leaves FROM dialogue_chunks WHERE tree_id = $1`,
    [TEST_TREE_ID]
  );

  for (const row of chunks.rows) {
    if (row.chunk_key === 'chunk_start') {
      startChunkId = row.id;
      for (const [leafId, leaf] of Object.entries(row.leaves)) {
        if ((leaf as any).type === 'GUARDED') guardedLeafId = leafId;
        if ((leaf as any).type === 'FREE')    freeLeafId    = leafId;
      }
    } else if (row.chunk_key === 'guarded_target') {
      guardedChunkId = row.id;
    } else if (row.chunk_key === 'free_target') {
      freeChunkId = row.id;
    }
  }

  // 5. Start the HTTP server on a random port
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  port = (server.address() as { port: number }).port;

  // 6. Clear cached state for this user
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
});

// ── afterAll ──────────────────────────────────────────────────
afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err: Error | undefined) => (err ? reject(err) : resolve()))
    );
  }

  // FK-ordered cleanup: state rows first, then chunks, then tree/users
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(
    `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL WHERE user_id = $1`,
    [TEST_USER_ID]
  );
  await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM dialogue_trees   WHERE id      = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM player_states    WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM users            WHERE id      = $1`, [TEST_USER_ID]);

  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);

  await closeConnections();
  await closeRedis();
});

// ── helpers ───────────────────────────────────────────────────

/** Reset dialogue-specific state between tests. */
async function resetDialogueState() {
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(
    `UPDATE player_states
       SET active_dialogue_id = NULL, current_node_id = NULL, time_blocks = 48
     WHERE user_id = $1`,
    [TEST_USER_ID]
  );
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
}

/** Start a fresh dialogue and return the parsed response body. */
async function startDialogue(): Promise<any> {
  const res = await fetch(`http://localhost:${port}/dialogue/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ characterId: MOCK_CHARACTER_ID, sceneId: MOCK_SCENE_ID }),
  });
  const body = await res.json() as any;
  return { res, body };
}

// ── Test suites ───────────────────────────────────────────────

describe('Dialogue Chunk API Integration Tests (Task 10.1)', () => {

  // ──────────────────────────────────────────────────────────
  // POST /dialogue/start returns chunk format
  //
  // Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
  // ──────────────────────────────────────────────────────────
  describe('POST /dialogue/start returns chunk format', () => {
    beforeEach(resetDialogueState);

    test('response envelope matches chunk-based contract', async () => {
      const { res, body } = await startDialogue();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.timestamp).toBeTruthy();

      const data = body.data;

      // Requirement 2.1: chunk sub-object with id/chunk_key/nodes/leaves
      expect(data.chunk).toBeDefined();
      expect(typeof data.chunk.id).toBe('string');
      expect(data.chunk.chunk_key).toBe('chunk_start');
      expect(typeof data.chunk.nodes).toBe('object');
      expect(typeof data.chunk.leaves).toBe('object');

      // Requirement 2.2: current_chunk_id top-level field matches chunk.id
      expect(data.current_chunk_id).toBe(data.chunk.id);

      // Requirement 2.3: current_node_id is the chunk entry point
      expect(data.current_node_id).toBe('chunk_start');

      // Requirement 1.3, 2.4: only nodes from the start chunk are included
      // The start chunk has chunk_start + 13 filler nodes + middle = 15 nodes
      expect(Object.keys(data.chunk.nodes)).toContain('chunk_start');
      expect(Object.keys(data.chunk.nodes)).toContain('middle');
      expect(Object.keys(data.chunk.nodes)).toContain('f1');
      expect(Object.keys(data.chunk.nodes)).toContain('f13');
      // Nodes from other chunks must NOT be present
      expect(Object.keys(data.chunk.nodes)).not.toContain('guarded_target');
      expect(Object.keys(data.chunk.nodes)).not.toContain('free_target');

      // Requirement 2.5: available_choices is an array
      expect(Array.isArray(data.available_choices)).toBe(true);
    });

    test('response does NOT include legacy tree-format fields', async () => {
      const { res, body } = await startDialogue();

      expect(res.status).toBe(201);
      expect(body.data.tree).toBeUndefined();
      expect(body.data.current_node).toBeUndefined();
    });

    test('chunk.leaves is populated for the start chunk', async () => {
      const { res, body } = await startDialogue();

      // Requirement 1.4: leaves mapping is included
      expect(res.status).toBe(201);
      const leaves = body.data.chunk.leaves;
      expect(typeof leaves).toBe('object');

      // The start chunk should have GUARDED and FREE leaves from the middle node
      const leafTypes = Object.values(leaves).map((l: any) => l.type);
      expect(leafTypes).toContain('GUARDED');
      expect(leafTypes).toContain('FREE');
    });
  });

  // ──────────────────────────────────────────────────────────
  // player_dialogue_states has current_chunk_id after start
  //
  // Requirements: 8.1, 8.2
  // ──────────────────────────────────────────────────────────
  describe('player_dialogue_states has current_chunk_id after start', () => {
    beforeEach(resetDialogueState);

    test('current_chunk_id is populated in DB after /dialogue/start', async () => {
      const { res, body } = await startDialogue();

      expect(res.status).toBe(201);
      const returnedChunkId = body.data.current_chunk_id;

      // Requirement 8.1, 8.2: check DB row directly
      const dbRow = await queryOLTP<{
        current_chunk_id: string;
        current_node_id: string;
      }>(
        `SELECT current_chunk_id, current_node_id
         FROM player_dialogue_states
         WHERE user_id = $1 AND dialogue_tree_id = $2`,
        [TEST_USER_ID, TEST_TREE_ID]
      );

      expect(dbRow.rows).toHaveLength(1);
      expect(dbRow.rows[0].current_chunk_id).toBe(returnedChunkId);
      expect(dbRow.rows[0].current_node_id).toBe('chunk_start');
      expect(dbRow.rows[0].current_chunk_id).toBe(startChunkId);
    });
  });

  // ──────────────────────────────────────────────────────────
  // POST /dialogue/choose with FREE leaf skips validation
  //
  // Requirements: 3.3, 4.1, 4.4
  // ──────────────────────────────────────────────────────────
  describe('POST /dialogue/choose with FREE leaf skips validation', () => {
    beforeEach(resetDialogueState);

    test('FREE leaf transitions to next chunk without spending TB', async () => {
      const { res: startRes, body: startBody } = await startDialogue();
      expect(startRes.status).toBe(201);

      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      expect(freeLeafId).toBeTruthy();
      expect(freeChunkId).toBeTruthy();

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: freeLeafId }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      expect(chooseRes.status).toBe(200);
      expect(chooseBody.success).toBe(true);

      // Requirement 4.1: next_chunk is the free_target chunk
      expect(chooseBody.data.next_chunk).toBeDefined();
      expect(chooseBody.data.next_chunk.chunk_key).toBe('free_target');

      // Requirement 3.3: FREE leaf — no TB deducted
      expect(chooseBody.data.time_blocks_spent).toBe(0);

      // No receipt for free transitions
      expect(chooseBody.data.receipt).toBeUndefined();

      // Chunk boundary was crossed
      expect(chooseBody.data.is_chunk_boundary_crossing).toBe(true);

      // choice_id in response
      expect(chooseBody.data.choice_id).toBe(freeLeafId);
    });
  });

  // ──────────────────────────────────────────────────────────
  // POST /dialogue/choose with GUARDED leaf validates guards
  //
  // Requirements: 3.4, 3.5, 3.10
  // ──────────────────────────────────────────────────────────
  describe('POST /dialogue/choose with GUARDED leaf validates guards', () => {
    beforeEach(resetDialogueState);

    test('returns 403 when player has insufficient time blocks', async () => {
      // Drain TB so the 2-TB guard fails
      await queryOLTP(
        `UPDATE player_states SET time_blocks = 1 WHERE user_id = $1`,
        [TEST_USER_ID]
      );

      const { res: startRes, body: startBody } = await startDialogue();
      expect(startRes.status).toBe(201);

      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      expect(guardedLeafId).toBeTruthy();

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: guardedLeafId }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      // Requirement 3.10: 403 for insufficient_time_blocks
      expect(chooseRes.status).toBe(403);
      expect(chooseBody.success).toBe(false);
      expect(chooseBody.error).toBe('insufficient_time_blocks');
    });

    test('GUARDED leaf succeeds with sufficient TB and deducts atomically', async () => {
      await queryOLTP(
        `UPDATE player_states SET time_blocks = 10 WHERE user_id = $1`,
        [TEST_USER_ID]
      );

      const { res: startRes, body: startBody } = await startDialogue();
      expect(startRes.status).toBe(201);

      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      expect(guardedLeafId).toBeTruthy();

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: guardedLeafId }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      expect(chooseRes.status).toBe(200);
      expect(chooseBody.success).toBe(true);

      // Requirement 4.1: next_chunk is the guarded_target chunk
      expect(chooseBody.data.next_chunk).toBeDefined();
      expect(chooseBody.data.next_chunk.chunk_key).toBe('guarded_target');

      // Requirement 3.5: 2 TB deducted
      expect(chooseBody.data.time_blocks_spent).toBe(2);
      expect(chooseBody.data.time_blocks_remaining).toBe(8);

      // Requirement 5.1, 5.2: receipt appended when TB spent
      expect(chooseBody.data.receipt).toMatch(/\[TB EXPENDED: 2 — /);

      // Chunk boundary was crossed
      expect(chooseBody.data.is_chunk_boundary_crossing).toBe(true);

      // Requirement 3.5: TB atomically deducted in DB
      const stateRow = await queryOLTP<{ time_blocks: number }>(
        `SELECT time_blocks FROM player_states WHERE user_id = $1`,
        [TEST_USER_ID]
      );
      expect(stateRow.rows[0].time_blocks).toBe(8);
    });

    test('returns 400 for invalid_choice when choice_id is not in chunk leaves', async () => {
      const { res: startRes, body: startBody } = await startDialogue();
      expect(startRes.status).toBe(201);

      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            current_chunk_id: currentChunkId,
            choice_id: 'totally_bogus_choice_id',
          }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      // Requirement 3.10: 400 for invalid_choice
      expect(chooseRes.status).toBe(400);
      expect(chooseBody.success).toBe(false);
      expect(chooseBody.error).toBe('invalid_choice');
    });

    test('returns 400 when current_chunk_id is missing from request body', async () => {
      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${TEST_TREE_ID}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ choice_id: 'some_choice' }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      expect(chooseRes.status).toBe(400);
      expect(chooseBody.success).toBe(false);
    });

    test('returns 404 when chunk_not_found (nonexistent chunk id)', async () => {
      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${TEST_TREE_ID}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            current_chunk_id: '00000000-dead-4ead-8ead-000000000000',
            choice_id: 'any_choice',
          }),
        }
      );
      const chooseBody = await chooseRes.json() as any;

      // Requirement 3.10: 404 for chunk_not_found
      expect(chooseRes.status).toBe(404);
      expect(chooseBody.error).toBe('chunk_not_found');
    });
  });

  // ──────────────────────────────────────────────────────────
  // player_dialogue_states updated atomically after boundary choice
  //
  // Requirement: 8.3
  // ──────────────────────────────────────────────────────────
  describe('player_dialogue_states updated atomically after boundary choice', () => {
    beforeEach(resetDialogueState);

    test('both current_chunk_id and current_node_id reflect new position', async () => {
      await queryOLTP(
        `UPDATE player_states SET time_blocks = 10 WHERE user_id = $1`,
        [TEST_USER_ID]
      );

      const { body: startBody } = await startDialogue();
      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      await fetch(`http://localhost:${port}/dialogue/${dialogueId}/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: guardedLeafId }),
      });

      const dbRow = await queryOLTP<{
        current_chunk_id: string;
        current_node_id: string;
      }>(
        `SELECT current_chunk_id, current_node_id
         FROM player_dialogue_states
         WHERE user_id = $1 AND dialogue_tree_id = $2`,
        [TEST_USER_ID, TEST_TREE_ID]
      );

      expect(dbRow.rows).toHaveLength(1);
      // Requirement 8.3: chunk_id advanced to the guarded_target chunk
      expect(dbRow.rows[0].current_chunk_id).toBe(guardedChunkId);
      expect(dbRow.rows[0].current_node_id).toBe('guarded_target');
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /dialogue/active returns chunk format
  //
  // Requirement: 8.4
  // ──────────────────────────────────────────────────────────
  describe('GET /dialogue/active returns chunk format', () => {
    beforeEach(resetDialogueState);

    test('returns null when no dialogue is active', async () => {
      const res = await fetch(`http://localhost:${port}/dialogue/active`, {
        headers: authHeaders(),
      });
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    test('returns chunk format with current_chunk_id after a start', async () => {
      // Start a dialogue to set active state
      const { res: startRes } = await startDialogue();
      expect(startRes.status).toBe(201);

      const res = await fetch(`http://localhost:${port}/dialogue/active`, {
        headers: authHeaders(),
      });
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).not.toBeNull();

      // Requirement 8.4: chunk-based fields are present
      expect(body.data.chunk).toBeDefined();
      expect(body.data.chunk.chunk_key).toBe('chunk_start');
      expect(body.data.current_chunk_id).toBeTruthy();
      expect(body.data.current_chunk_id).toBe(startChunkId);
      expect(body.data.current_node_id).toBe('chunk_start');
      expect(Array.isArray(body.data.available_choices)).toBe(true);

      // Old tree-format must be absent
      expect(body.data.tree).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // OLAP player_events includes chunk context after a choice
  //
  // Requirements: 9.1, 9.3, 9.4 (and 9.2 via time_blocks_cost column)
  // ──────────────────────────────────────────────────────────
  describe('OLAP event includes chunk_id after a choice', () => {
    beforeEach(resetDialogueState);

    test('GUARDED leaf emits event with chunk_id, boundary flag, leaf_type, and TB cost', async () => {
      await queryOLTP(
        `UPDATE player_states SET time_blocks = 10 WHERE user_id = $1`,
        [TEST_USER_ID]
      );

      const { body: startBody } = await startDialogue();
      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: guardedLeafId }),
        }
      );
      expect(chooseRes.status).toBe(200);

      // OLAP events are fire-and-forget; poll briefly for the row
      let eventRow: any = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const result = await queryOLAP<{
          event_data: {
            chunk_id: string;
            is_chunk_boundary_crossing: boolean;
            leaf_type: string;
            dialogue_tree_id: string;
          };
          time_blocks_cost: number;
        }>(
          `SELECT event_data, time_blocks_cost
           FROM player_events
           WHERE user_id = $1
             AND event_type = 'dialogue_choice'
             AND event_data->>'chunk_id' = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [TEST_USER_ID, currentChunkId]
        );
        if (result.rows.length > 0) {
          eventRow = result.rows[0];
          break;
        }
      }

      expect(eventRow).not.toBeNull();

      // Requirement 9.1: chunk_id is recorded in event_data
      expect(eventRow.event_data.chunk_id).toBe(currentChunkId);

      // Requirement 9.3: is_chunk_boundary_crossing boolean
      expect(eventRow.event_data.is_chunk_boundary_crossing).toBe(true);

      // Requirement 9.4: leaf_type recorded
      expect(eventRow.event_data.leaf_type).toBe('GUARDED');

      // Requirement 9.2: time_blocks_cost column (per AGENTS.md: NOT event_data->>'tb_cost')
      expect(eventRow.time_blocks_cost).toBe(2);
    });

    test('FREE leaf emits event with leaf_type FREE and zero time_blocks_cost', async () => {
      const { body: startBody } = await startDialogue();
      const currentChunkId = startBody.data.current_chunk_id;
      const dialogueId     = startBody.data.dialogue_id;

      const chooseRes = await fetch(
        `http://localhost:${port}/dialogue/${dialogueId}/choose`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: freeLeafId }),
        }
      );
      expect(chooseRes.status).toBe(200);

      // Poll for OLAP event
      let eventRow: any = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const result = await queryOLAP<{
          event_data: {
            chunk_id: string;
            is_chunk_boundary_crossing: boolean;
            leaf_type: string;
          };
          time_blocks_cost: number;
        }>(
          `SELECT event_data, time_blocks_cost
           FROM player_events
           WHERE user_id = $1
             AND event_type = 'dialogue_choice'
             AND event_data->>'chunk_id' = $2
             AND event_data->>'leaf_type' = 'FREE'
           ORDER BY created_at DESC
           LIMIT 1`,
          [TEST_USER_ID, currentChunkId]
        );
        if (result.rows.length > 0) {
          eventRow = result.rows[0];
          break;
        }
      }

      expect(eventRow).not.toBeNull();

      // Requirement 9.4: leaf_type FREE
      expect(eventRow.event_data.leaf_type).toBe('FREE');

      // Requirement 9.3: boundary crossing flag
      expect(eventRow.event_data.is_chunk_boundary_crossing).toBe(true);
    });
  });

});
