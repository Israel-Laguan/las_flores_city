import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { deleteCache, invalidatePattern, closeRedis } from '@las-flores/infra';
import { compileDialogueTree } from '../../src/content/compiler.js';
import { publishDialogueTree } from '../../src/services/ContentPublishService.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// D2 · Choice-reachability validation — regression test
//
// Verifies that a submitted choice_id belonging to a sibling node
// (exists in the tree but not reachable from the player's current
// node) is rejected BEFORE any effect processing, with zero side
// effects applied (flags/stats/TB/cursor/choices_made unchanged).
//
// Rejection is 400 invalid_choice (distinguishable from 5xx).
// ============================================================

const TEST_USER_ID = 'd2000000-0001-4001-8001-000000000001';
const TEST_TREE_ID = 'd2000000-0002-4002-8002-000000000002';
const MOCK_CHARACTER_ID = TEST_TREE_ID;
const MOCK_SCENE_ID = 'd2000000-0003-4003-8003-000000000003';

function fillerNode(id: string, nextId: string): DialogueNode {
  return { id, type: 'narrator', text: `Filler ${id}`, choices: [{ id: `c_${id}`, text: 'Continue', next_node_id: nextId }] };
}

// Tree layout (15 nodes in chunk_start → boundary leaves for middle):
// chunk_start -> f1..f13 -> middle
// middle has two sibling choices:
//   c_pay  -> guarded_target  (GUARDED leaf, tb_cost 2, flag_set d2_sibling_marker)
//   c_free -> free_target     (FREE leaf)
// guarded_target / free_target are end nodes.
const TREE_NODES: Record<string, DialogueNode> = {
  chunk_start: {
    id: 'chunk_start',
    type: 'narrator',
    speaker_id: MOCK_CHARACTER_ID,
    text: 'You stand at the threshold.',
    choices: [{ id: 'c_into_f1', text: 'Enter', next_node_id: 'f1' }],
  },
  f1: fillerNode('f1', 'f2'),
  f2: fillerNode('f2', 'f3'),
  f3: fillerNode('f3', 'f4'),
  f4: fillerNode('f4', 'f5'),
  f5: fillerNode('f5', 'f6'),
  f6: fillerNode('f6', 'f7'),
  f7: fillerNode('f7', 'f8'),
  f8: fillerNode('f8', 'f9'),
  f9: fillerNode('f9', 'f10'),
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
        time_block_cost: { amount: 2, description: 'toll' },
      } as any,
      {
        id: 'c_free',
        text: 'Slip through freely',
        next_node_id: 'free_target',
      } as any,
    ],
  },
  guarded_target: {
    id: 'guarded_target',
    type: 'narrator',
    text: 'You paid the toll.',
    // Attach a flag effect that would be observable if sibling choice effects were incorrectly applied.
    // In the real tree this lives on the choice's effects or the leaf's choice_effects;
    // we put it on the destination node for extra signal, though sibling rejection should
    // prevent ANY writes. The primary zero-effects check is TB + cursor + choices_made.
    effects: { flag_set: { d2_sibling_marker: true } } as any,
    is_end: true,
  },
  free_target: {
    id: 'free_target',
    type: 'narrator',
    text: 'You slipped through.',
    is_end: true,
  },
};

const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof app.listen>;
let port: number;
let startChunkId = '';

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

beforeAll(async () => {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'd2-test@test.example', 'd2_test', 'D2 Test')
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [TEST_USER_ID],
  );
  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, stats, state, alignment)
     VALUES ($1, 48, 100, 0, 1, 'prologue', '{}', '{}', '{}', 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET time_blocks = 48, flags = '{}', stats = '{}', state = '{}'`,
    [TEST_USER_ID],
  );
  await queryOLTP(
    `INSERT INTO characters (id, name, title, description, avatar_url, available_dialogues, metadata)
     VALUES ($1, 'D2 Test Character', 'Test', 'D2', 'https://example.com/avatar.png', '{}'::uuid[], '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [MOCK_CHARACTER_ID],
  );
  const treeUrl = await publishDialogueTree(TEST_TREE_ID, JSON.stringify({ nodes: TREE_NODES }));
  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, character_id, start_node_id, content_url)
     VALUES ($1, 'D2 Reachability Test Tree', $2, 'chunk_start', $3)
     ON CONFLICT (id) DO UPDATE SET content_url = EXCLUDED.content_url, character_id = EXCLUDED.character_id, start_node_id = EXCLUDED.start_node_id, updated_at = NOW()`,
    [TEST_TREE_ID, MOCK_CHARACTER_ID, treeUrl],
  );
  await compileDialogueTree(TEST_TREE_ID);

  const chunks = await queryOLTP<{ id: string; chunk_key: string }>(
    `SELECT id, chunk_key FROM dialogue_chunks WHERE tree_id = $1`,
    [TEST_TREE_ID],
  );
  for (const row of chunks.rows) {
    if (row.chunk_key === 'chunk_start') startChunkId = row.id;
  }

  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  port = (server.address() as { port: number }).port;

  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
});

afterAll(async () => {
  if (server) await new Promise<void>((res, rej) => server.close((e: any) => (e ? rej(e) : res())));
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM characters WHERE id = $1`, [MOCK_CHARACTER_ID]);
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
  await closeConnections();
  await closeRedis();
});

async function resetDialogueState() {
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(
    `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL, time_blocks = 48, flags = '{}', stats = '{}', state = '{}' WHERE user_id = $1`,
    [TEST_USER_ID],
  );
  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
}

async function startDialogue(): Promise<any> {
  const res = await fetch(`http://localhost:${port}/dialogue/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ characterId: MOCK_CHARACTER_ID, sceneId: MOCK_SCENE_ID }),
  });
  const body = (await res.json()) as any;
  return { res, body };
}

describe('D2 choice-reachability validation', () => {
  beforeEach(resetDialogueState);

  test('sibling choice is rejected with 400 invalid_choice and zero effects applied', async () => {
    const { res: startRes, body: startBody } = await startDialogue();
    expect(startRes.status).toBe(201);
    const currentChunkId = startBody.data.current_chunk_id as string;
    const dialogueId = startBody.data.dialogue_id as string;
    // Cursor is at chunk_start; valid choice there is c_into_f1. Sibling c_pay lives on middle.
    expect(currentChunkId).toBeTruthy();
    expect(startChunkId).toBe(currentChunkId);

    // Snapshot side-effects before the sibling submission
    const beforeState = await queryOLTP<{ time_blocks: number; flags: any; stats: any; current_node_id: string | null }>(
      `SELECT time_blocks, flags, stats, current_node_id FROM player_states WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    const beforeRow = beforeState.rows[0];
    expect(beforeRow.time_blocks).toBe(48);
    const beforeChoices = await queryOLTP<{ choices_made: any; current_node_id: string }>(
      `SELECT choices_made, current_node_id FROM player_dialogue_states WHERE user_id = $1 AND dialogue_tree_id = $2`,
      [TEST_USER_ID, TEST_TREE_ID],
    );
    const beforeChoicesMade = JSON.stringify(beforeChoices.rows[0]?.choices_made ?? null);
    const beforeNodeId = beforeChoices.rows[0]?.current_node_id;

    // Submit sibling choice c_pay while at chunk_start — must be rejected
    const chooseRes = await fetch(`http://localhost:${port}/dialogue/${dialogueId}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: 'c_pay' }),
    });
    const chooseBody = (await chooseRes.json()) as any;

    // Distinguishable from server error: 400 invalid_choice, not 5xx
    expect(chooseRes.status).toBe(400);
    expect(chooseRes.status).not.toBeGreaterThanOrEqual(500);
    expect(chooseBody.success).toBe(false);
    expect(chooseBody.error).toBe('invalid_choice');

    // Zero effects: TB unchanged
    const afterState = await queryOLTP<{ time_blocks: number; flags: any; stats: any; current_node_id: string | null }>(
      `SELECT time_blocks, flags, stats, current_node_id FROM player_states WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(afterState.rows[0].time_blocks).toBe(beforeRow.time_blocks);
    expect(afterState.rows[0].flags).toEqual(beforeRow.flags);
    expect(afterState.rows[0].stats).toEqual(beforeRow.stats);
    // No flag from guarded_target was set
    expect(afterState.rows[0].flags).not.toHaveProperty('d2_sibling_marker');

    // Cursor unchanged
    const afterChoices = await queryOLTP<{ choices_made: any; current_node_id: string; current_chunk_id: string }>(
      `SELECT choices_made, current_node_id, current_chunk_id FROM player_dialogue_states WHERE user_id = $1 AND dialogue_tree_id = $2`,
      [TEST_USER_ID, TEST_TREE_ID],
    );
    expect(afterChoices.rows[0].current_node_id).toBe(beforeNodeId);
    expect(afterChoices.rows[0].current_chunk_id).toBe(currentChunkId);
    expect(JSON.stringify(afterChoices.rows[0].choices_made)).toBe(beforeChoicesMade);

    // Player states cursor also unchanged
    expect(afterState.rows[0].current_node_id).toBe(beforeNodeId);
  });

  test('sibling next_node_id is also rejected with zero effects', async () => {
    const { res: startRes, body: startBody } = await startDialogue();
    expect(startRes.status).toBe(201);
    const currentChunkId = startBody.data.current_chunk_id as string;
    const dialogueId = startBody.data.dialogue_id as string;

    const before = await queryOLTP<{ time_blocks: number }>(`SELECT time_blocks FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
    const beforeTB = before.rows[0].time_blocks;

    // Sibling next_node_id (guarded_target) submitted while at chunk_start
    const chooseRes = await fetch(`http://localhost:${port}/dialogue/${dialogueId}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: 'guarded_target' }),
    });
    const chooseBody = (await chooseRes.json()) as any;

    expect(chooseRes.status).toBe(400);
    expect(chooseBody.error).toBe('invalid_choice');

    const after = await queryOLTP<{ time_blocks: number }>(`SELECT time_blocks FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
    expect(after.rows[0].time_blocks).toBe(beforeTB);
  });

  test('valid current-node choice still succeeds (no regression)', async () => {
    const { res: startRes, body: startBody } = await startDialogue();
    expect(startRes.status).toBe(201);
    const currentChunkId = startBody.data.current_chunk_id as string;
    const dialogueId = startBody.data.dialogue_id as string;

    // At chunk_start, the only valid choice is c_into_f1 (intra-chunk, no leaf)
    const chooseRes = await fetch(`http://localhost:${port}/dialogue/${dialogueId}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ current_chunk_id: currentChunkId, choice_id: 'c_into_f1' }),
    });
    const chooseBody = (await chooseRes.json()) as any;
    expect(chooseRes.status).toBe(200);
    expect(chooseBody.success).toBe(true);
  });
});
