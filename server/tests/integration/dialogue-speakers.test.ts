import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { invalidatePattern, closeRedis } from '../../src/database/redis.js';
import express from 'express';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';

// ============================================================
// Dialogue speakers enrichment integration tests
//
// Feature: visual-novel-dialogue-mode
//
// Verifies that chunk dialogue responses include `data.speakers` —
// a `characterId -> { name, title, avatar_url, portrait_urls }` map
// resolved from the chunk's node speaker_ids. The client VN viewport
// consumes this to render expression-specific portraits (node.visual.expression).
//
// Exercises the real GET /dialogue/active route end-to-end with
// dedicated synthetic rows (user, character, tree, chunk, cursor).
// ============================================================

const TEST_USER_ID = 'd1000000-0000-4000-8000-000000000101';
const TEST_CHARACTER_ID = 'd1000000-0000-4000-8000-000000000102';
const TEST_TREE_ID = 'd1000000-0000-4000-8000-000000000103';
const TEST_CHUNK_ID = 'd1000000-0000-4000-8000-000000000104';
const TEST_OVERLAY_ID = 'd1000000-0000-4000-8000-000000000105';

const TEST_PORTRAIT_URLS = [
  { url: 'http://minio.test/las-flores/characters/speaker-test/speaker-test__neutral.png', label: 'dev', expression: 'neutral' },
  { url: 'http://minio.test/las-flores/characters/speaker-test/speaker-test__calculating.png', label: 'dev', expression: 'calculating' },
  { url: 'http://minio.test/las-flores/characters/speaker-test/speaker-test__default.png', label: 'dev' },
];

const TEST_NODES = {
  root: {
    id: 'root',
    type: 'character',
    speaker_id: TEST_CHARACTER_ID,
    text: 'Speaker enrichment test line.',
    visual: { expression: 'calculating', mood: 'tense', position: 'right' },
  },
};

const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof express.application.listen>;
let port: number;

describe('Dialogue speakers enrichment', () => {
  beforeAll(async () => {
    // Apply migrations the route/cursor depend on (globalSetup already
    // applied the full migration set; these are idempotent safety nets).
    const fs = await import('fs');
    const path = await import('path');
    const { queryOLTP } = await import('../../src/database/connection.js');
    const applyMigration = async (filename: string) => {
      const sql = fs.readFileSync(
        path.resolve(process.cwd(), 'src/database/migrations', filename),
        'utf-8'
      );
      try {
        await queryOLTP(sql);
      } catch {
        // Already applied
      }
    };
    await applyMigration('001_initial_schema.sql');
    await applyMigration('005_dialogue_service.sql');
    await applyMigration('032_dialogue_chunk_tracking.sql');

    // Dedicated synthetic user (AGENTS.md test-isolation rule #1 / #2).
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, 'speakers-test@example.com', 'speakers_test', 'Speakers Test')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID]
    );

    // Character with expression-tagged portrait_urls (the asset
    // convention AssetEntrySchema.expression + AssetStageResolver use).
    await queryOLTP(
      `INSERT INTO characters (id, name, title, description, avatar_url, portrait_urls)
       VALUES ($1, 'Speaker Test Character', 'Inspector', 'Test character', 'http://minio.test/avatar.png', $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET portrait_urls = EXCLUDED.portrait_urls`,
      [TEST_CHARACTER_ID, JSON.stringify(TEST_PORTRAIT_URLS)]
    );

    // Dialogue tree whose root node references the character + visual.
    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
       VALUES ($1, 'speakers_test_tree', 'root', $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [TEST_TREE_ID, JSON.stringify(TEST_NODES)]
    );

    // AOT-compiled chunk for the tree (as the content compiler would write).
    await queryOLTP(
      `INSERT INTO dialogue_chunks (id, tree_id, chunk_key, nodes, leaves)
       VALUES ($1, $2, 'root', $3::jsonb, '{}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [TEST_CHUNK_ID, TEST_TREE_ID, JSON.stringify(TEST_NODES)]
    );

    // Player cursor pointing at the chunk + node.
    await queryOLTP(
      `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment, active_dialogue_id, current_node_id)
       VALUES ($1, 24, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral', $2, 'root')
       ON CONFLICT (user_id) DO UPDATE SET active_dialogue_id = $2, current_node_id = 'root'`,
      [TEST_USER_ID, TEST_TREE_ID]
    );
    await queryOLTP(
      `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, current_chunk_id, choices_made)
       VALUES ($1, $2, 'root', $3, '[]'::jsonb)
       ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET current_chunk_id = $3, current_node_id = 'root'`,
      [TEST_USER_ID, TEST_TREE_ID, TEST_CHUNK_ID]
    );

    server = await new Promise<ReturnType<typeof express.application.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    try {
      await queryOLTP(`DELETE FROM dialogue_overlays WHERE id = $1 OR target_tree_id = $1`, [TEST_OVERLAY_ID]);
      await queryOLTP(`DELETE FROM player_dialogue_states WHERE dialogue_tree_id = $1`, [TEST_TREE_ID]);
      await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
      await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id = $1`, [TEST_TREE_ID]);
      await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [TEST_TREE_ID]);
      await queryOLTP(`DELETE FROM characters WHERE id = $1`, [TEST_CHARACTER_ID]);
      await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
      await invalidatePattern(`dialogue:resolved:${TEST_TREE_ID}:*`);
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  it('GET /dialogue/active includes speakers with portrait_urls for the current chunk', async () => {
    const res = await fetch(`http://localhost:${port}/dialogue/active`, {
      headers: { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` },
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    const speakers = body.data.speakers;
    expect(speakers).toHaveProperty(TEST_CHARACTER_ID);

    const speaker = speakers[TEST_CHARACTER_ID];
    expect(speaker.name).toBe('Speaker Test Character');
    expect(speaker.title).toBe('Inspector');
    expect(Array.isArray(speaker.portrait_urls)).toBe(true);
    // Expression-tagged variants present for node.visual.expression.
    expect(speaker.portrait_urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expression: 'calculating' }),
        expect.objectContaining({ expression: 'neutral' }),
      ])
    );

    // Phase 1 contract: node.visual survives the full server round-trip.
    const currentNode = (body.data.chunk?.nodes ?? {})[body.data.current_node_id];
    expect(currentNode).toMatchObject({
      speaker_id: TEST_CHARACTER_ID,
      visual: { expression: 'calculating', mood: 'tense', position: 'right' },
    });
  });

  it('collectSpeakerIds extracts distinct ids and ignores nodes without speaker_id', async () => {
    const { collectSpeakerIds } = await import('../../src/routes/dialogue-speakers.js');

    expect(
      collectSpeakerIds({
        a: { id: 'a', type: 'narrator', text: 'x' },
        b: { id: 'b', type: 'character', speaker_id: TEST_CHARACTER_ID, text: 'y' },
        c: { id: 'c', type: 'character', speaker_id: TEST_CHARACTER_ID, text: 'z' },
      })
    ).toEqual([TEST_CHARACTER_ID]);

    expect(
      collectSpeakerIds({
        a: { id: 'a', type: 'narrator', text: 'x' },
      })
    ).toEqual([]);
  });

  it('resolveChunkSpeakers returns an empty map for nodes with no speaker', async () => {
    const { resolveChunkSpeakers } = await import('../../src/routes/dialogue-speakers.js');
    const speakers = await resolveChunkSpeakers({});
    expect(speakers).toEqual({});
  });
});
