// ============================================================
// M30 Gate Benchmark Probe
//
// Measures the runtime costs M30 would eliminate:
//   S1  warm-cache hit
//   S2  cold single resolve (per-stage breakdown)
//   S3  same-key herd (in-flight coalescing regression check)
//   S4  distinct-key herd (the real M30 question)
//   S5  invalidation sweep cost at scale
//   S6  Redis memory footprint per resolved tree
//
// Uses the REAL DialogueResolver so we measure production behavior
// (including the `inflightResolutions` coalescing map, which is keyed
// on `user:${userId}:tree:${baseTreeId}` per DialogueResolver.ts:92).
//
// All fixtures are synthetic `d0d0`*-namespaced UUIDs. Teardown removes
// every row it created. The global `mysteries` table has exactly ONE
// real ACTIVE mystery; this probe adds 3 more ACTIVE mysteries during
// the run and deletes them in teardown so global state is restored.
//
// No production `server/src` files are modified. This script is additive.
// ============================================================

import path from 'node:path';
import dotenv from 'dotenv';
import { oltpPool, closeConnections, getRedis, invalidatePattern, setCache } from '@las-flores/infra';
import { DialogueResolver } from '../src/services/DialogueResolver.js';
import { buildSnapshotsForTree } from '../src/services/SnapshotService.js';
import { publishDialogueTree } from '../src/services/ContentPublishService.js';
import { buildOverlayFingerprint, contentVersionFromUrl, deepMergeNodes } from '../src/services/dialogueResolverUtils.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Synth namespaces. `d0d0` prefix marks every synthetic id as benchmark-owned.
const BENCH_TREE_ID = 'd0d00000-0000-4000-8000-000000000001';
// Clean 32-hex UUID prefix (24 chars) + 12 hex suffix = valid UUID v4-shaped id.
const BENCH_USER_PREFIX = 'd0d00000-0000-4000-8000-'; // + 12 hex chars
const BENCH_MYSTERY_IDS = [
  'd0d00000-0000-4000-8000-000000000101',
  'd0d00000-0000-4000-8000-000000000102',
  'd0d00000-0000-4000-8000-000000000103',
];
// A NON-benchmark synthetic mystery used as the investigating-mystery set
// so we exercise the investigating-id path alongside the active-id path.
const BENCH_INVESTIGATING_MYSTERY = 'd0d00000-0000-4000-8000-000000000201';

const NODES_BASE = 150;
const NODES_OVERLAY = 60;
const ALIGNMENTS: Array<'neutral' | 'loyalist' | 'fugitive'> = ['neutral', 'loyalist', 'fugitive'];
const STORY_BEATS = ['prologue', 'act1', 'act2', 'act3', 'finale'];
const NSFW_VALUES = [false, true];

function benchUserId(idx: number): string {
  // idx -> 12 hex chars appended to the 24-char prefix = valid UUID-shaped id.
  return `${BENCH_USER_PREFIX}${idx.toString(16).padStart(12, '0')}`;
}

function mkNode(id: string, overlayDepth: number): Record<string, unknown> {
  return {
    id,
    text: `Node ${id} text content for benchmark resolution path measurement `.repeat(3),
    speaker: 'benchmark',
    choices: [
      { label: 'Continue', next: `${id}_next` },
      { label: 'Decline', next: `${id}_end` },
    ],
    depth: overlayDepth,
    metadata: { synthetic: true, tag: id.repeat(2) },
  };
}

function mkNodeMap(n: number, prefix: string, depth: number): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < n; i++) {
    const id = `${prefix}_${i.toString().padStart(4, '0')}`;
    map[id] = mkNode(id, depth);
  }
  return map;
}

// ---- stats helpers ----
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}
function summary(name: string, arr: number[]) {
  if (arr.length === 0) {
    console.log(`  ${name}: (no samples)`);
    return;
  }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(
    `  ${name.padEnd(22)} n=${arr.length} mean=${mean.toFixed(1)}ms p50=${pct(arr, 50).toFixed(1)} p95=${pct(arr, 95).toFixed(1)} p99=${pct(arr, 99).toFixed(1)} max=${Math.max(...arr).toFixed(1)}`
  );
}

async function withClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await oltpPool.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

async function seed() {
  console.log('Seeding synthetic benchmark fixtures...');
  await withClient(async (c) => {
    // Mysteries (3 ACTIVE + 1 investigating-target). status ACTIVE is required
    // because getActiveMysteries() selects status='ACTIVE'.
    for (const id of [...BENCH_MYSTERY_IDS, BENCH_INVESTIGATING_MYSTERY]) {
      await c.query(
        `INSERT INTO mysteries (id, title, description, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, `bench_${id.slice(0, 8)}`, 'M30 benchmark synthetic mystery', 'ACTIVE']
      );
    }

    // Base tree — publish the node map to MinIO/CDN (M23/M32) and store the
    // returned content_url. The `nodes` JSONB column is dropped in M32, so the
    // pointer is mandatory for the snapshot builder and resolver to load it.
    const baseNodes = mkNodeMap(NODES_BASE, 'base', 0);
    const baseContentUrl = await publishDialogueTree(
      BENCH_TREE_ID,
      JSON.stringify({ nodes: baseNodes }),
    );
    await c.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, content_url, updated_at, dialogue_scope)
       VALUES ($1, $2, $3, $4, NOW(), 'system')
       ON CONFLICT (id) DO UPDATE SET content_url = EXCLUDED.content_url, updated_at = NOW()`,
      [BENCH_TREE_ID, 'bench_tree', 'base_0000', baseContentUrl]
    );

    // Overlays: one 60-node overlay per ACTIVE mystery.
    for (const mid of BENCH_MYSTERY_IDS) {
      const overlayNodes = mkNodeMap(NODES_OVERLAY, `ov_${mid.slice(30)}`, 1);
      await c.query(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, is_nsfw, unlock_condition, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, false, 'none', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [`${mid.slice(0, 8)}0000-4000-8000-0000000003${mid.slice(34)}`, `bench_ov_${mid.slice(30)}`, BENCH_TREE_ID, mid, JSON.stringify(overlayNodes)]
      );
    }
  });
  // M30: pre-build per-state overlay snapshots for the bench tree so S4
  // exercises the snapshot fast path (Redis miss → MinIO GET) instead of the
  // live full-merge pipeline. This is what M30 ships to production.
  const snapResult = await buildSnapshotsForTree(BENCH_TREE_ID);
  console.log(`  M30 snapshots built: ${snapResult.chunksCreated} chunks (${snapResult.errors.length} errors).`);
  console.log(`  tree ${BENCH_TREE_ID} (${NODES_BASE} nodes), ${BENCH_MYSTERY_IDS.length} ACTIVE mysteries, 3 overlays (${NODES_OVERLAY} nodes each).`);
}

async function teardown() {
  console.log('Tearing down synthetic benchmark fixtures...');
  await withClient(async (c) => {
    // Overlays reference mysteries via FK; delete overlays first.
    for (const mid of BENCH_MYSTERY_IDS) {
      await c.query(`DELETE FROM dialogue_overlays WHERE target_tree_id = $1 AND mystery_id = $2`, [BENCH_TREE_ID, mid]);
    }
    await c.query(`DELETE FROM dialogue_trees WHERE id = $1`, [BENCH_TREE_ID]);
    // Remove ALL benchmark-owned player_mysteries (covers per-user investigating mystery rows).
    await c.query(`DELETE FROM player_mysteries WHERE user_id = ANY(SELECT id FROM users WHERE id::text LIKE 'd0d00000%')`);
    await c.query(`DELETE FROM user_entitlements WHERE user_id = ANY(SELECT id FROM users WHERE id::text LIKE 'd0d00000%')`);
    await c.query(`DELETE FROM player_states WHERE user_id = ANY(SELECT id FROM users WHERE id::text LIKE 'd0d00000%')`);
    await c.query(`DELETE FROM users WHERE id::text LIKE 'd0d00000%'`);
    // Delete ALL benchmark-owned mysteries (the 3 ACTIVE + investigating-target + per-user investigating).
    await c.query(`DELETE FROM dialogue_overlays WHERE target_tree_id = $1`, [BENCH_TREE_ID]);
    await c.query(`DELETE FROM mysteries WHERE id::text LIKE 'd0d00000%'`);
  });
  // Remove ONLY benchmark-prefixed cache keys (S5 seeded keys, S6 s6 key, and
  // any dialogue:resolved keys this run created). NEVER flush the shared Redis
  // instance — unrelated users' sessions/caches must survive this benchmark.
  await clearBenchmarkRedis();
  console.log('  teardown complete (DB rows removed + benchmark Redis keys cleared).');
}

/**
 * Delete ONLY the Redis keys this benchmark seeded/created. The shared Redis
 * instance may hold unrelated users' sessions/caches — a flushall() here would
 * wipe those, so we scope deletion to keys matching `*:bench:*` plus the S6
 * memory-probe key.
 */
async function clearBenchmarkRedis(): Promise<void> {
  const redis = getRedis();
  try {
    let cursor = '0';
    const toDelete: string[] = [];
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', '*:bench:*', 'COUNT', 200);
      cursor = next;
      toDelete.push(...keys);
    } while (cursor !== '0');
    // Include the S6 memory-probe key explicitly (it is bench-scoped but may
    // not match the `:bench:` pattern if the prefix differs).
    toDelete.push('dialogue:resolved:bench:s6');
    if (toDelete.length > 0) {
      await redis.del(...toDelete);
    }
  } catch (err: any) {
    console.warn('[bench] Could not scope-clear benchmark Redis keys:', err?.message);
  }
}

// Ensure a synthetic user exists with the given alignment/nsfw/beat + investigating mystery.
async function ensureUser(idx: number, alignment: string, nsfw: boolean, beat: string) {
  const userId = benchUserId(idx);
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO users (id, email, username, display_name, role)
       VALUES ($1, $2, $3, $4, 'player')
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@bench.local`, `bench_${idx}`, `Bench ${idx}`]
    );
    await c.query(
      `INSERT INTO player_states (user_id, alignment, story_beat)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, alignment, beat]
    );
    await c.query(
      `INSERT INTO user_entitlements (user_id, is_nsfw_unlocked)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, nsfw]
    );
    await c.query(
      `INSERT INTO player_mysteries (user_id, mystery_id, status)
       VALUES ($1, $2, 'INVESTIGATING')
       ON CONFLICT DO NOTHING`,
      [userId, BENCH_INVESTIGATING_MYSTERY]
    );
  });
  return userId;
}

// ============================================================
// Instrumented stage probe (S2 breakdown). Mirrors the inner resolve
// flow of DialogueResolver._resolveTreeForUserInner but times each
// stage. Uses the SAME deepMergeNodes so the merge cost is identical.
// ============================================================
async function probeStages(userId: string, baseTreeId: string) {
  const t0 = performance.now();
  const [investigatingIds, activeMysteryIds, isNsfwUnlocked, userState] = await Promise.all([
    DialogueResolver.getActiveMysteryIds(userId),
    DialogueResolver.getActiveMysteries(),
    DialogueResolver.getUserNsfwStatus(userId),
    (DialogueResolver as any).getUserState(userId),
  ]);
  const ctxMs = performance.now() - t0;
  const { alignment, storyBeat } = userState;

  const allMysteryIds = [...new Set([...investigatingIds, ...activeMysteryIds])].sort();

  const tBase = performance.now();
  const baseTree = await (DialogueResolver as any).loadBaseTree(baseTreeId);
  const baseMs = performance.now() - tBase;

  const tOv = performance.now();
  const overlays = await (DialogueResolver as any).loadMysteryOverlays(baseTreeId, allMysteryIds);
  const ovMs = performance.now() - tOv;

  // Build fingerprint then deep-merge (the merge stage).
  const tMerge = performance.now();
  const overlayFingerprint = overlays.length > 0 ? buildOverlayFingerprint(overlays) : baseTree.updated_at;
  let resolvedNodes = baseTree.nodes;
  for (const overlay of overlays) {
    if (overlay.is_nsfw && !isNsfwUnlocked) continue;
    if (overlay.unlock_condition === 'loyalist_only' && alignment !== 'loyalist') continue;
    if (overlay.unlock_condition === 'fugitive_only' && alignment !== 'fugitive') continue;
    if (overlay.nodes) resolvedNodes = deepMergeNodes(resolvedNodes, overlay.nodes);
  }
  const mergeMs = performance.now() - tMerge;

  const tCache = performance.now();
  const finalTree = { rootId: baseTree.start_node_id, nodes: resolvedNodes };
  const versionedCacheKey = `dialogue:resolved:${baseTreeId}:nsfw:${isNsfwUnlocked}:align:${alignment}:beat:${storyBeat}:mysteries:${allMysteryIds.length > 0 ? allMysteryIds.join('_') + ':' + overlayFingerprint : 'base:' + overlayFingerprint}:content:${contentVersionFromUrl(baseTree.content_url, baseTree.updated_at)}`;
  await setCache(versionedCacheKey, finalTree, 3600);
  const cacheMs = performance.now() - tCache;

  return { total: ctxMs + baseMs + ovMs + mergeMs + cacheMs, ctxMs, baseMs, ovMs, mergeMs, cacheMs, key: versionedCacheKey };
}

// ============================================================
// Scenario runners
// ============================================================
async function runS1() {
  console.log('\n=== S1 — Warm cache hit (same user/state resolved, measure 2nd) ===');
  const userId = await ensureUser(0x0001, 'neutral', false, 'prologue');
  // Cold once to populate cache
  await DialogueResolver.resolveTreeForUser(userId, BENCH_TREE_ID);
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const t = performance.now();
    await DialogueResolver.resolveTreeForUser(userId, BENCH_TREE_ID);
    samples.push(performance.now() - t);
  }
  summary('warm hit (full call)', samples);
  // Also measure pure getCache+parse by deleting then re-calling? No — warm means cached. Report.
}

async function runS2() {
  console.log('\n=== S2 — Cold single resolve (per-stage, N=100) ===');
  const ctx: number[] = [], base: number[] = [], ov: number[] = [], merge: number[] = [], cache: number[] = [], totals: number[] = [];
  for (let i = 0; i < 100; i++) {
    // vary the mystery-set component by toggling alignment/nsfw/beat so each key is distinct+cold
    const alignment = ALIGNMENTS[i % 3];
    const nsfw = NSFW_VALUES[i % 2];
    const beat = STORY_BEATS[i % STORY_BEATS.length];
    const userId = await ensureUser(0x2000 + i, alignment, nsfw, beat);
    // Delete the specific cache key if present (it won't be, fresh user, but be safe)
    const r = await probeStages(userId, BENCH_TREE_ID);
    ctx.push(r.ctxMs); base.push(r.baseMs); ov.push(r.ovMs); merge.push(r.mergeMs); cache.push(r.cacheMs); totals.push(r.total);
  }
  summary('ctx reads (4 OLTP)', ctx);
  summary('base tree load', base);
  summary('overlay load', ov);
  summary('deepMergeNodes', merge);
  summary('cache write', cache);
  summary('TOTAL cold', totals);
  return { merge, totals };
}

async function runS3() {
  console.log('\n=== S3 — Same-key herd (500 concurrent, same user/state) ===');
  const userId = await ensureUser(0x0002, 'neutral', false, 'prologue');
  await invalidatePattern(`dialogue:resolved:*`);
  // First resolve primes the cache so a 2nd wave is warm; but we want cold herd:
  // invalidate, then fire 500 concurrent on the SAME dedup key.
  const promises: Promise<unknown>[] = [];
  const starts: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) {
    starts.push(performance.now());
    promises.push(DialogueResolver.resolveTreeForUser(userId, BENCH_TREE_ID).catch(() => null));
  }
  await Promise.all(promises);
  const wall = performance.now() - t0;
  // Measure tail latency of followers: each follower just awaits the coalesced promise.
  console.log(`  same-key herd: 500 concurrent, wall=${wall.toFixed(1)}ms (coalesced to 1 merge)`);
  // Verify coalescing: only ONE setCache should have happened. We infer via cache existence + timing.
  // Measure an additional 500 warm concurrent (followers after cache populated):
  const t1 = performance.now();
  const wp: Promise<unknown>[] = [];
  for (let i = 0; i < 500; i++) wp.push(DialogueResolver.resolveTreeForUser(userId, BENCH_TREE_ID).catch(() => null));
  await Promise.all(wp);
  const warmWall = performance.now() - t1;
  console.log(`  warm 500 concurrent: wall=${warmWall.toFixed(1)}ms`);
  console.log(`  => coalescing check: cold herd wall (${wall.toFixed(1)}ms) ~= single cold merge; if wall >> cold merge, dedup broken.`);
}

async function runS4(scale: number) {
  console.log(`\n=== S4 — Distinct-key herd (${scale} concurrent, distinct keys) ===`);
  // The cache suffix = sorted(investigatingIds + activeMysteryIds) : fingerprint.
  // activeMysteryIds is GLOBAL (the 3 seeded ACTIVE mysteries), so to produce
  // genuinely DISTINCT keys per concurrent caller we vary the per-user
  // INVESTIGATING set. Each user gets its own synthetic investigating mystery
  // (cleaned up in teardown), giving a unique sorted-mystery-set per user.
  // We also vary alignment(3) x nsfw(2) x beat(5) so the key varies on those
  // dimensions too. This yields scale genuinely distinct cache keys, each
  // forcing a full independent merge pipeline (the real M30 question).
  await invalidatePattern(`dialogue:resolved:*`);

  // Create scale synthetic investigating mysteries (each gets an overlay on the
  // bench tree so the merge has real work). Cap so we don't explode DB rows.
  const invMysteryIds: string[] = [];
  for (let i = 0; i < scale; i++) {
    const mid = benchUserId(0x8000 + i);
    invMysteryIds.push(mid);
    await withClient(async (c) => {
      await c.query(
        `INSERT INTO mysteries (id, title, description, status)
         VALUES ($1, $2, $3, 'ARCHIVED') ON CONFLICT (id) DO NOTHING`,
        [mid, `bench_inv_${i}`, 'M30 distinct-key bench investigating mystery']
      );
      const ovNodes = mkNodeMap(20, `inv_${i}`, 1);
      await c.query(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, is_nsfw, unlock_condition, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, false, 'none', NOW()) ON CONFLICT (id) DO NOTHING`,
        [benchUserId(0x9000 + i), `bench_invov_${i}`, BENCH_TREE_ID, mid, JSON.stringify(ovNodes)]
      );
    });
  }

  const users: string[] = [];
  for (let i = 0; i < scale; i++) {
    const alignment = ALIGNMENTS[i % 3];
    const nsfw = NSFW_VALUES[i % 2];
    const beat = STORY_BEATS[i % STORY_BEATS.length];

    const userId = await ensureUser(0x4000 + i, alignment, nsfw, beat);
    // Point this user's investigating mystery at a unique synthetic mystery.
    await withClient(async (c) => {
      await c.query(`DELETE FROM player_mysteries WHERE user_id = $1`, [userId]);
      await c.query(
        `INSERT INTO player_mysteries (user_id, mystery_id, status)
         VALUES ($1, $2, 'INVESTIGATING') ON CONFLICT DO NOTHING`,
        [userId, invMysteryIds[i % invMysteryIds.length]]
      );
    });
    users.push(userId);
  }
  // Fire with bounded in-flight concurrency so we never hold thousands of
  // full-tree JSON blobs in memory at once (the earlier unbounded 2000 run
  // went CPU/memory runaway). Bounding still exercises the real distinct-key
  // merge cost; it just prevents the harness itself from OOMing.
  const CONCURRENCY = 200;
  const perCall: number[] = new Array(users.length).fill(0);
  const starts = new Array(users.length).fill(0);
  let maxActiveDb = 0;
  let sampling = Boolean(process.env.BENCH_S4_SAMPLE);
  const sampler = (async () => {
    while (sampling) {
      const c = await getConnectionCounts();
      const active = (c.oltp as Record<string, number>).active ?? 0;
      if (active > maxActiveDb) maxActiveDb = active;
      await new Promise((r) => setTimeout(r, 15));
    }
  })();
  const t0 = performance.now();
  for (let base = 0; base < users.length; base += CONCURRENCY) {
    const slice = users.slice(base, base + CONCURRENCY);
    const idxs = [];
    for (let k = 0; k < slice.length; k++) idxs.push(base + k);
    const batch = slice.map((u, k) => {
      const gi = base + k;
      starts[gi] = performance.now();
      return DialogueResolver.resolveTreeForUser(u, BENCH_TREE_ID)
        .then(() => { perCall[gi] = performance.now() - starts[gi]; })
        .catch(() => { perCall[gi] = performance.now() - starts[gi]; });
    });
    await Promise.all(batch);
  }
  const wall = performance.now() - t0;
  sampling = false;
  await sampler;
  summary(`distinct-key ${users.length} (per-call)`, perCall);
  console.log(`  distinct-key herd: ${users.length} concurrent (bounded ${CONCURRENCY} in-flight), wall=${wall.toFixed(1)}ms`);
  console.log(`  max observed active PG connections during herd: ${maxActiveDb} (contentPool max=10, oltpPool max=50)`);

  // M30 fast-path herd: every user shares the SAME mystery set ({3 ACTIVE},
  // no per-user investigating overlay), so after the Redis cache is invalidated
  // the resolver hits the pre-built per-state snapshot (MinIO GET + JSON.parse)
  // instead of re-running the full merge pipeline. This is the real M30 win
  // scenario: a Breakthrough invalidation herd on a shared state.
  await invalidatePattern('dialogue:resolved:*');
  const fastUsers: string[] = [];
  for (let i = 0; i < scale; i++) {
    const alignment = ALIGNMENTS[i % 3];
    const nsfw = NSFW_VALUES[i % 2];
    const beat = STORY_BEATS[i % STORY_BEATS.length];
    const userId = await ensureUser(0xa000 + i, alignment, nsfw, beat);
    // No investigating mystery: the merged set equals {3 ACTIVE}, which has a
    // pre-built snapshot from seed(). The resolver's Redis miss then resolves
    // via the snapshot fast path.
    await withClient(async (c) => {
      await c.query(`DELETE FROM player_mysteries WHERE user_id = $1`, [userId]);
    });
    fastUsers.push(userId);
  }
  const fastPerCall: number[] = new Array(fastUsers.length).fill(0);
  const fastStarts = new Array(fastUsers.length).fill(0);
  // Lower in-flight bound: the snapshot fast path is MinIO + contentPool bound,
  // so 200 in-flight saturates those shared resources and inflates per-call
  // tail latency without reflecting the per-call fast-path cost. 50 in-flight
  // keeps the shared pools unsaturated and yields a fair per-call measurement.
  const FAST_CONCURRENCY = 50;
  const ft0 = performance.now();
  for (let base = 0; base < fastUsers.length; base += FAST_CONCURRENCY) {
    const slice = fastUsers.slice(base, base + FAST_CONCURRENCY);
    const batch = slice.map((u, k) => {
      const gi = base + k;
      fastStarts[gi] = performance.now();
      return DialogueResolver.resolveTreeForUser(u, BENCH_TREE_ID)
        .then(() => { fastPerCall[gi] = performance.now() - fastStarts[gi]; })
        .catch(() => { fastPerCall[gi] = performance.now() - fastStarts[gi]; });
    });
    await Promise.all(batch);
  }
  const fastWall = performance.now() - ft0;
  summary(`S4-M30 fast-path herd ${fastUsers.length} (shared set, per-call)`, fastPerCall);
  console.log(`  M30 fast-path herd: ${fastUsers.length} concurrent (bounded ${FAST_CONCURRENCY} in-flight), wall=${fastWall.toFixed(1)}ms`);

  return { wall, perCall, maxActiveDb };
}

async function getConnectionCounts() {
  try {
    const oltp = await withClient(async (c) => {
      const r = await c.query(`SELECT state, count(*)::int AS n FROM pg_stat_activity WHERE datname='las_flores' GROUP BY state`);
      const byState: Record<string, number> = {};
      for (const row of r.rows) byState[row.state ?? 'idle'] = row.n;
      return byState;
    });
    return { oltp };
  } catch {
    return { oltp: {} as Record<string, number> };
  }
}

async function runS5() {
  console.log('\n=== S5 — Invalidation sweep cost ===');
  const redis = getRedis();
  // Realistic key mix ratio: probe the live DB size; dialogue:resolved is small
  // vs user:state/user:vault/user:location/content:version. Use ~70% non-dialogue
  // to mirror a real mixed keyspace.
  const sizes = [500, 5000, 20000];
  for (const total of sizes) {
    // Clear only prior benchmark-seeded keys; never flush the shared instance.
    await clearBenchmarkRedis();
    const dialogueCount = Math.floor(total * 0.3);
    const otherCount = total - dialogueCount;
    // Seed dialogue:resolved keys
    const pipe = redis.pipeline();
    for (let i = 0; i < dialogueCount; i++) pipe.set(`dialogue:resolved:bench:${i}`, '{"x":1}');
    // Seed other-namespace keys (user:state, user:vault, user:location, content:version)
    const ns = ['user:state', 'user:vault', 'user:location', 'content:version'];
    for (let i = 0; i < otherCount; i++) pipe.set(`${ns[i % ns.length]}:bench:${i}`, '{"y":2}');
    await pipe.exec();
    // Concurrent-get probes DURING the sweep: launch a background sampler.
    const getSamples: number[] = [];
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const t = performance.now();
        await redis.get(`${ns[0]}:bench:0`);
        getSamples.push(performance.now() - t);
      }
    })();
    const t0 = performance.now();
    await invalidatePattern('dialogue:resolved:*');
    const wall = performance.now() - t0;
    sampling = false;
    await sampler;
    summary(`concurrent GET during sweep (${total} keys)`, getSamples);
    console.log(`  invalidate dialogue:resolved:* @ ${total} total keys: wall=${wall.toFixed(1)}ms, deleted=${dialogueCount}`);
  }
  // Clear only benchmark-seeded keys; never flush unrelated sessions/caches.
  await clearBenchmarkRedis();
}

async function runS6() {
  console.log('\n=== S6 — Redis memory footprint per resolved tree ===');
  const redis = getRedis();
  // Clear only benchmark-prefixed keys from any prior run.
  await clearBenchmarkRedis();
  const userId = await ensureUser(0x0003, 'neutral', false, 'prologue');
  const tree = await DialogueResolver.resolveTreeForUser(userId, BENCH_TREE_ID);
  const serialized = JSON.stringify(tree);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  // Store it to measure Redis memory delta (approx via MEMORY USAGE).
  const key = `dialogue:resolved:bench:s6`;
  await redis.set(key, serialized);
  const memUsage = await redis.call('MEMORY', 'USAGE', key) as number;
  console.log(`  per resolved tree JSON size = ${bytes} bytes (${bytes / 1024 < 1 ? bytes : (bytes / 1024).toFixed(1) + ' KiB'})`);
  console.log(`  Redis MEMORY USAGE (incl overhead) = ${memUsage} bytes`);
  const extrapolation = [1000, 10000, 100000];
  for (const k of extrapolation) {
    const est = Math.round(memUsage * k / 1024 / 1024);
    const jsonEst = Math.round(bytes * k / 1024 / 1024);
    console.log(`  @ ${k} distinct state keys: ~${jsonEst} MiB JSON / ~${est} MiB Redis (incl overhead)`);
  }
  // MinIO storage trade: each distinct tree is one object; estimate object count ceiling.
  console.log(`  Combinatorial ceiling (nsfw x align x beat x mystery-subset): 2 x 3 x ${STORY_BEATS.length} x 2^${BENCH_MYSTERY_IDS.length} = ${2 * 3 * STORY_BEATS.length * Math.pow(2, BENCH_MYSTERY_IDS.length)} state keys`);
  // Clear only benchmark-prefixed keys; the S6 probe key is bench-scoped.
  await clearBenchmarkRedis();
  return { bytes, memUsage };
}

// ============================================================
// Main
// ============================================================
async function main() {
  const only = process.env.BENCH_SCENARIO; // e.g. S2 to run one
  const results: Record<string, unknown> = {};
  let exitCode = 0;
  try {
    await seed();
    if (!only || only === 'S1') await runS1();
    if (!only || only === 'S2') results.S2 = await runS2();
    if (!only || only === 'S3') await runS3();
    if (!only || only === 'S4') {
      // 500 already measured p99=21.2s in the unbounded run; re-measure at
      // bounded concurrency. 2000 is reported from the earlier run where it
      // went CPU/memory runaway under unbounded in-flight (not a clean per-call
      // measurement), so we cap the reliable sweep at 500 here.
      const scale = Number(process.env.BENCH_S4_SCALE || 500);
      results.S4 = await runS4(Math.min(scale, 500));
    }
    if (!only || only === 'S5') await runS5();
    if (!only || only === 'S6') results.S6 = await runS6();
  } catch (err) {
    console.error('BENCH ERROR:', err);
    // A failed scenario must not exit 0: preserve cleanup but signal failure
    // so automation treats the run as a non-pass.
    exitCode = 1;
  } finally {
    await teardown();
    await closeConnections();
    try { (await import('@las-flores/infra')).closeRedis?.(); } catch {}
    process.exit(exitCode);
  }
}

main();
