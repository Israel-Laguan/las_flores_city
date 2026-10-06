/**
 * SC-S6: Dialogue serving baseline.
 * Measures p50/p95 for GET /dialogue/active, resolveChunkSpeakers() and the bulk
 * characters SELECT, and derives presigning-only / rest-of-endpoint cost by
 * per-iteration paired differencing.
 *
 * Seeds one synthetic dialogue tree (3 nodes) whose speakers are 3 REAL characters from
 * the seeded dataset — the one with the most portrait_urls entries plus two with exactly
 * one — publishes it via ContentPublishService (post-M32 the node maps live behind
 * `content_url`), compiles it into a chunk, and points a synthetic player's cursor at it.
 * Everything synthetic is removed in a `finally` block, including when the run throws.
 *
 * Per iteration i (3 warmup + 30 timed), all three measurements share the index:
 *   1. bulk characters SELECT alone  — the exact query resolveChunkSpeakers issues
 *   2. resolveChunkSpeakers()        — in-process, SELECT + presign
 *   3. GET /dialogue/active          — real HTTP against an in-process express app
 *                                      mounting the real dialogueRouter + authMiddleware
 *   presigning_i = resolveChunkSpeakers_i - bulkSelect_i   (estimate: also covers speaker collection)
 *   rest_i       = endpoint_i - resolveChunkSpeakers_i     (estimate: separate calls, not one request)
 *
 * Needs postgres-oltp, redis and minio reachable (same env as the server) and the
 * content migrated. No running game-server is required.
 *
 * Usage (from repo root):  npm run spike:sc-s6 --workspace=server
 *   or:                    cd server && npx tsx scripts/spike_sc_s6_serving_baseline.ts
 * Exits 0 and prints p50/p95 for every measurement; non-zero on any failure.
 */

import process, { hrtime } from 'node:process';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { queryOLTP, closeConnections, deleteCache, invalidatePattern } from '@las-flores/infra';
import { dialogueRouter } from '../src/routes/dialogue.js';
import { resolveChunkSpeakers } from '../src/routes/dialogue-speakers.js';
import { generateToken } from '../src/middleware/auth.js';
import { compileDialogueTree } from '../src/content/compiler.js';
import { publishDialogueTree } from '../src/services/ContentPublishService.js';

// Dedicated UUIDs (collision avoidance): prefix 5c560000 is used by no other fixture.
const SYNTHETIC_USER_ID = '5c560000-0001-4001-8001-000000000001';
const SYNTHETIC_TREE_ID = '5c560000-0002-4002-8002-000000000002';

const WARMUP_ITERATIONS = 3;
const TIMED_ITERATIONS = 30;
const TOTAL_ITERATIONS = WARMUP_ITERATIONS + TIMED_ITERATIONS;

const START_NODE = 's6_a';

interface Stats {
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { n: sorted.length, min: sorted[0], p50: at(50), p95: at(95), max: sorted[sorted.length - 1] };
}

function fmt(label: string, s: Stats): string {
  const f = (v: number) => `${v.toFixed(2)}ms`;
  return `${label.padEnd(58)} n=${s.n} min=${f(s.min)} p50=${f(s.p50)} p95=${f(s.p95)} max=${f(s.max)}`;
}

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = hrtime.bigint();
  await fn();
  return Number(hrtime.bigint() - start) / 1_000_000;
}

/** Real characters: the one with the most portrait_urls entries, then two with exactly one. */
async function pickRealCharacters(): Promise<string[]> {
  const heavy = await queryOLTP<{ id: string; n: number }>(
    `SELECT id, jsonb_array_length(portrait_urls::jsonb) AS n FROM characters
     WHERE jsonb_typeof(portrait_urls::jsonb) = 'array'
     ORDER BY n DESC, id LIMIT 1`,
  );
  // CASE guards jsonb_array_length: Postgres does not guarantee AND short-circuiting, and the
  // function raises on non-array JSONB. Excluding the heavy id keeps the three speakers distinct.
  const light = await queryOLTP<{ id: string }>(
    `SELECT id FROM characters
     WHERE id <> $1
       AND CASE
         WHEN jsonb_typeof(portrait_urls::jsonb) = 'array'
           THEN jsonb_array_length(portrait_urls::jsonb) = 1
         ELSE false
       END
     ORDER BY id LIMIT 2`,
    [heavy.rows[0]?.id ?? null],
  );
  if (heavy.rows.length !== 1 || light.rows.length !== 2) {
    throw new Error('SC-S6: seeded dataset lacks characters with portrait_urls — migrate content first.');
  }
  console.log(`speakers: ${heavy.rows[0].id} (${heavy.rows[0].n} portrait_urls), ${light.rows.map((r) => r.id).join(', ')} (1 each)`);
  return [heavy.rows[0].id, ...light.rows.map((r) => r.id)];
}

async function seed(speakerIds: string[]): Promise<string> {
  const [a, b, c] = speakerIds;
  const nodes = {
    s6_a: { id: 's6_a', type: 'character', speaker_id: a, text: 'SC-S6 node A.', choices: [{ id: 's6_c1', text: 'Next', next_node_id: 's6_b' }] },
    s6_b: { id: 's6_b', type: 'character', speaker_id: b, text: 'SC-S6 node B.', choices: [{ id: 's6_c2', text: 'Next', next_node_id: 's6_c' }] },
    s6_c: { id: 's6_c', type: 'character', speaker_id: c, text: 'SC-S6 node C.', is_end: true },
  };

  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'sc-s6@test.example', 'sc_s6_baseline', 'SC-S6 Baseline')
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [SYNTHETIC_USER_ID],
  );
  const treeUrl = await publishDialogueTree(SYNTHETIC_TREE_ID, JSON.stringify({ nodes }));
  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, content_url)
     VALUES ($1, 'SC-S6 serving baseline tree', $2, $3)
     ON CONFLICT (id) DO UPDATE SET content_url = EXCLUDED.content_url, updated_at = NOW()`,
    [SYNTHETIC_TREE_ID, START_NODE, treeUrl],
  );
  await compileDialogueTree(SYNTHETIC_TREE_ID);

  const chunk = await queryOLTP<{ id: string }>(
    'SELECT id FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = $2',
    [SYNTHETIC_TREE_ID, START_NODE],
  );
  if (chunk.rows.length !== 1) throw new Error(`SC-S6: expected one chunk for ${START_NODE}, got ${chunk.rows.length}`);
  const chunkId = chunk.rows[0].id;

  // Cursor: player_states.active_dialogue_id/current_node_id + player_dialogue_states.current_chunk_id.
  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment, active_dialogue_id, current_node_id)
     VALUES ($1, 48, 0, 0, 1, 'prologue', '{}', 'neutral', $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET active_dialogue_id = EXCLUDED.active_dialogue_id, current_node_id = EXCLUDED.current_node_id`,
    [SYNTHETIC_USER_ID, SYNTHETIC_TREE_ID, START_NODE],
  );
  await queryOLTP(
    `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, current_chunk_id, choices_made)
     VALUES ($1, $2, $3, $4, '[]')
     ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET current_node_id = EXCLUDED.current_node_id, current_chunk_id = EXCLUDED.current_chunk_id`,
    [SYNTHETIC_USER_ID, SYNTHETIC_TREE_ID, START_NODE, chunkId],
  );
  await deleteCache(`user:state:${SYNTHETIC_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${SYNTHETIC_TREE_ID}:*`);
  return chunkId;
}

/** FK-ordered removal; safe to call when seeding only partly happened. */
async function cleanup(): Promise<void> {
  await queryOLTP('DELETE FROM player_dialogue_states WHERE user_id = $1', [SYNTHETIC_USER_ID]);
  await queryOLTP('DELETE FROM player_states WHERE user_id = $1', [SYNTHETIC_USER_ID]);
  await queryOLTP('DELETE FROM dialogue_chunks WHERE tree_id = $1', [SYNTHETIC_TREE_ID]);
  await queryOLTP('DELETE FROM dialogue_trees WHERE id = $1', [SYNTHETIC_TREE_ID]);
  await queryOLTP('DELETE FROM users WHERE id = $1', [SYNTHETIC_USER_ID]);
  await deleteCache(`user:state:${SYNTHETIC_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${SYNTHETIC_TREE_ID}:*`);
}

async function measure(speakerIds: string[], url: string, token: string): Promise<void> {
  const nodes = Object.fromEntries(speakerIds.map((id, i) => [`n${i}`, { speaker_id: id }]));
  const endpoint: number[] = [];
  const resolve: number[] = [];
  const select: number[] = [];
  let sampleInfo = '';

  for (let i = 0; i < TOTAL_ITERATIONS; i++) {
    const s = await timed(() =>
      queryOLTP(
        'SELECT id, name, title, avatar_url, portrait_urls FROM characters WHERE id = ANY($1::uuid[])',
        [speakerIds],
      ),
    );
    const r = await timed(() => resolveChunkSpeakers(nodes));
    const e = await timed(async () => {
      const res = await fetch(`${url}/dialogue/active`, { headers: { Authorization: `Bearer ${token}` } });
      const body = (await res.json()) as { data?: { speakers?: Record<string, { portrait_urls: unknown[] }> } | null };
      if (!res.ok || !body.data) throw new Error(`GET /dialogue/active failed: ${res.status} ${JSON.stringify(body)}`);
      const speakers = body.data.speakers ?? {};
      sampleInfo = `${Object.keys(speakers).length} speakers, ${Object.values(speakers).reduce((n, sp) => n + sp.portrait_urls.length, 0)} presigned portrait_urls total`;
    });
    if (i >= WARMUP_ITERATIONS) {
      select.push(s);
      resolve.push(r);
      endpoint.push(e);
    }
  }

  // Paired per-iteration differences — NOT p50(total) - p50(select). These are ESTIMATES: each
  // measurement is a separate call, so the pairing shares only the iteration index, not a request.
  const presigning = resolve.map((r, i) => r - select[i]);
  const rest = endpoint.map((e, i) => e - resolve[i]);
  const share = resolve.map((r, i) => (r / endpoint[i]) * 100);

  console.log(`sample response: ${sampleInfo}`);
  console.log(fmt('full endpoint GET /dialogue/active (HTTP):', stats(endpoint)));
  console.log(fmt('resolveChunkSpeakers total (SELECT + presign):', stats(resolve)));
  console.log(fmt('bulk SELECT only:', stats(select)));
  console.log('');
  const p = stats(presigning);
  const rs = stats(rest);
  const sh = stats(share);
  console.log('Estimates from separate calls (not stage timings within one request):');
  console.log(`est. non-SELECT resolver cost, incl. presigning (resolve_i - select_i): p50=${p.p50.toFixed(2)}ms p95=${p.p95.toFixed(2)}ms`);
  console.log(`est. endpoint cost outside resolver (endpoint_i - resolve_i):          p50=${rs.p50.toFixed(2)}ms p95=${rs.p95.toFixed(2)}ms`);
  console.log(`est. resolver share of endpoint (resolve_i / endpoint_i):              p50=${sh.p50.toFixed(1)}% p95=${sh.p95.toFixed(1)}%`);
}

async function main(): Promise<void> {
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    const speakerIds = await pickRealCharacters();
    const chunkId = await seed(speakerIds);
    console.log(`seeded tree ${SYNTHETIC_TREE_ID}, chunk ${chunkId}`);

    const app = express();
    app.use(express.json());
    app.use('/dialogue', dialogueRouter);
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

    await measure(speakerIds, url, generateToken(SYNTHETIC_USER_ID));
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await cleanup();
    await closeConnections();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('SC-S6 harness failed:', err);
    process.exit(1);
  },
);
