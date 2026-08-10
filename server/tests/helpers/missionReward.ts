/**
 * Shared integration harness for mission-reward dialogue tests (M34).
 *
 * Both `mission-reward-grants.test.ts` and `mission-reward-anti-double.test.ts`
 * seed the same set of rows (user / player_state / vault_item / dialogue_tree),
 * compile the chunk graph, boot an Express server exposing the dialogue router,
 * reset per-test state, and tear everything down. That ~90-line block was
 * copy-pasted into both files; extracting it here keeps the actual reward
 * assertions in the test files the focus and means a schema/seed change only
 * needs one edit.
 *
 * Each call to `createMissionRewardFixture` returns an isolated fixture with its
 * own app + server + seed data (keyed off the caller-provided synthetic UUIDs),
 * so two suites can run in parallel without touching the other's rows.
 */

import express from 'express';
import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { deleteCache, invalidatePattern, closeRedis } from '../../src/database/redis.js';
import { compileDialogueTree } from '../../src/content/compiler.js';
import type { DialogueNode } from '@las-flores/shared';

export interface MissionRewardFixtureConfig {
  /** Synthetic UUIDs (collision-avoidance per AGENTS.md). */
  userId: string;
  treeId: string;
  vaultItemId: string;
  /** Human labels + seeded row content. */
  treeName: string;
  treeNodes: Record<string, DialogueNode>;
  email: string;
  username: string;
  displayName: string;
  vaultItemTitle: string;
  vaultItemDescription: string;
}

export interface MissionRewardFixture {
  /** Seed rows, compile chunks, boot the server. Call once in `beforeAll`. */
  boot(): Promise<{ port: number; startChunkId: string }>;
  post(path: string, body: object): Promise<Response>;
  /** Reset per-test mutable state (dialogue position, credits, claims, vault). */
  resetState(): Promise<void>;
  /** Close the server, delete seeded rows, release pools. Call in `afterAll`. */
  cleanup(): Promise<void>;
}

export function createMissionRewardFixture(
  config: MissionRewardFixtureConfig,
): MissionRewardFixture {
  const app = express();
  app.use(express.json());
  app.use('/dialogue', dialogueRouter);

  let server: ReturnType<typeof app.listen> | null = null;
  let port = 0;
  let startChunkId = '';

  function authHeaders() {
    return { Authorization: `Bearer ${generateToken(config.userId)}` };
  }

  async function post(path: string, body: object): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  }

  async function boot(): Promise<{ port: number; startChunkId: string }> {
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [config.userId, config.email, config.username, config.displayName],
    );

    await queryOLTP(
      `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
       VALUES ($1, 48, 200, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
       ON CONFLICT (user_id) DO UPDATE SET credits = 200, time_blocks = 48, updated_at = NOW()`,
      [config.userId],
    );

    await queryOLTP(
      `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type)
       VALUES ($1, $2, $3, 'https://example.com/item.png', '/media/item.png', 'memento')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
      [config.vaultItemId, config.vaultItemTitle, config.vaultItemDescription],
    );

    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
       VALUES ($1, $2, 'start', $3)
       ON CONFLICT (id) DO UPDATE
         SET nodes = EXCLUDED.nodes,
             start_node_id = EXCLUDED.start_node_id,
             updated_at = NOW()`,
      [config.treeId, config.treeName, JSON.stringify(config.treeNodes)],
    );

    await compileDialogueTree(config.treeId);

    const chunks = await queryOLTP<{ id: string; chunk_key: string }>(
      `SELECT id, chunk_key FROM dialogue_chunks WHERE tree_id = $1`,
      [config.treeId],
    );
    startChunkId = chunks.rows.find(r => r.chunk_key === 'start')!.id;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    port = (server!.address() as { port: number }).port;

    await deleteCache(`user:state:${config.userId}`);
    await invalidatePattern(`dialogue:resolved:chunk:${config.treeId}:*`);

    return { port, startChunkId };
  }

  async function resetState(): Promise<void> {
    await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [config.userId]);
    await queryOLTP(
      `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL, credits = 200, time_blocks = 48 WHERE user_id = $1`,
      [config.userId],
    );
    await queryOLTP(`DELETE FROM mission_reward_claims WHERE user_id = $1`, [config.userId]);
    await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [config.userId]);
  }

  async function cleanup(): Promise<void> {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((err: Error | undefined) => (err ? reject(err) : resolve())),
      );
    }

    await queryOLTP(`DELETE FROM mission_reward_claims WHERE user_id = $1`, [config.userId]);
    await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [config.userId]);
    await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [config.userId]);
    await queryOLTP(
      `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL WHERE user_id = $1`,
      [config.userId],
    );
    await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id = $1`, [config.treeId]);
    await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [config.treeId]);
    await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [config.userId]);
    await queryOLTP(`DELETE FROM vault_items WHERE id = $1`, [config.vaultItemId]);
    await queryOLTP(`DELETE FROM users WHERE id = $1`, [config.userId]);

    await deleteCache(`user:state:${config.userId}`);
    await invalidatePattern(`dialogue:resolved:chunk:${config.treeId}:*`);

    await closeConnections();
    await closeRedis();
  }

  return { boot, post, resetState, cleanup };
}