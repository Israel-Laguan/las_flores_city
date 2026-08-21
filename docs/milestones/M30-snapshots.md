# M30 — Pre-Resolved Per-State Overlay Snapshots (Implementation)

> **Status:** Phase A in progress · **Phase:** Implementation
> **Plan:** this document is the canonical implementation plan for M30 Phase A.
> **Gate Verdict:** MET (`docs/milestones/M30-benchmark-results.md`)

## Overview

M30 Phase A implements pre-resolved overlay snapshots to eliminate the S4 distinct-key herd bottleneck.
After a Breakthrough invalidation, instead of each distinct key independently performing:
1. 4 parallel context reads (OLTP + content pool)
2. Base tree load
3. Overlay load
4. `deepMergeNodes` loop
5. Redis `setCache`

The cold miss now does:
1. Redis cache lookup (unchanged)
2. **On miss**: single DB lookup for snapshot pointer + MinIO GET + JSON.parse + Redis `setCache`

This eliminates the per-miss multi-read amplification and the `deepMergeNodes` CPU cost at
the herd tail.

## Implementation Details

### Persistence Choice (4.1a)

Reuses the `dialogue_chunks` table with synthetic `chunk_key` values encoding the snapshot state.

- **Table:** `dialogue_chunks` (existing, no new table)
- **chunk_key format:** `__snapshot_{setHash}_{nsfwFlag}_{alignment}`
  - `setHash`: 16-char truncated SHA-256 of sorted mystery ID set
  - `nsfwFlag`: `'t'` or `'f'` for true/false
  - `alignment`: `'neutral'`, `'loyalist'`, or `'fugitive'`
- **content_url:** points to MinIO blob at `s3://bucket/snapshots/{treeId}__{setHash}__{nsfw}__{alignment}__{hash}.json`
- **nodes:** the pre-merged node map (fallback when MinIO unavailable)

### Snapshot State Dimensions

A snapshot is computed for each unique combination of:
- `tree_id`: the dialogue tree
- `set`: sorted array of mystery IDs (ACTIVE + investigating)
- `nsfw`: boolean
- `alignment`: `'neutral'` | `'loyalist'` | `'fugitive'`

With 3 ACTIVE mysteries: 2³ = 8 subsets × 2 nsfw × 3 alignment = **48 variants per tree maximum**.
Only states with mysteries that have overlays for the tree are generated.

### Content-Addressed Blobs

Snapshot blobs are published to MinIO with object keys:

```
snapshots/{treeId}__{setHash}__{nsfw}__{alignment}__{contentHash}.json
```

Where `contentHash` is the full SHA-256 of the snapshot payload (nodes + metadata).
This ensures:
- **Immutability:** changed content → new hash → new key
- **Self-healing:** a re-published snapshot with new content has a new URL → the resolver's
  cache key (which incorporates the tree's `content_version`) forces fresh resolution
- **Cache consistency:** Redis remains a read-through layer; snapshot content changes
  propagate through the pointer

## Files Changed

### New Files

| File | Purpose |
|---|---|
| `server/src/services/SnapshotService.ts` | Snapshot compiler: builds, publishes, and persists snapshots |
| `server/tests/unit/DialogueResolver.snapshot.unit.test.ts` | Unit tests for snapshot fast path (mocked Redis) |
| `server/tests/integration/m30.snapshots.test.ts` | Integration tests with synthetic fixtures |
| `docs/milestones/M30-snapshots.md` | This document |

### Modified Files

| File | Change |
|---|---|
| `server/src/services/ContentPublishService.ts` | Added `publishDialogueSnapshot()` |
| `server/src/services/DialogueResolver.ts` | Added snapshot fast path in `_resolveTreeForUserInner` |
| `server/src/content/migrate.ts` | Hooked `buildSnapshotsForAllTrees()` into post-migration tasks |
| `docs/milestones/README.md` | Updated M30 status to "Phase A in progress" |

## API

### SnapshotService

#### `buildSnapshotsForTree(treeId)`

Builds all pre-resolved snapshots for a single dialogue tree.

**Behavior:**
1. Loads base tree + all overlays for the tree
2. Gets ACTIVE mystery IDs (global)
3. Generates all reachable mystery sets (subsets of ACTIVE + tree overlays)
4. For each combination of (set, nsfw, alignment):
   - Applies NSFW and alignment gates
   - Deep-merges base nodes with relevant overlays
   - Publishes content-addressed MinIO blob
   - Upserts pointer row in `dialogue_chunks`

**Returns:** `{ treeId, statesGenerated: SnapshotState[], chunksCreated: number, errors: string[] }`

#### `buildSnapshotsForAllTrees()`

Builds snapshots for all dialogue trees in the database.
Called from `migrate.ts` after chunk compilation, under the `content_migration` advisory lock.

**Returns:** `{ totalTrees: number, totalSnapshots: number, errors: string[] }`

#### `getSnapshotContentUrl(treeId, setHash, nsfw, alignment)`

Looks up a snapshot's `content_url` by state.
Used by `DialogueResolver` for the fast path.

**Returns:** `string | null` — the MinIO URL or null if no snapshot exists

#### `buildSetHash(mysteryIds)`

Builds a stable 16-char hash from a sorted array of mystery IDs.
Exported for use by `DialogueResolver`.

#### `buildSnapshotChunkKey(state)`

Builds the synthetic `chunk_key` for a snapshot state.

#### `parseSnapshotChunkKey(treeId, chunkKey)`

Parses a synthetic chunk_key back into its `SnapshotState` components.

### ContentPublishService

#### `publishDialogueSnapshot(treeId, setHash, nsfw, alignment, payload)`

Publishes a snapshot payload to MinIO.

**Object key:** `snapshots/{treeId}__{setHash}__{nsfw}__{alignment}__{hash}.json`

**Returns:** `s3://bucket/snapshots/...` URL

### DialogueResolver Changes

Modified `_resolveTreeForUserInner()`:

```typescript
// 1. Try Redis cache (unchanged)
const cachedTree = await getCache<ResolvedTree>(versionedCacheKey);
if (cachedTree) return cachedTree;

// 2. Try snapshot fast path
const setHash = allMysteryIds.length > 0 ? buildSetHash(allMysteryIds) : buildSetHash([]);
const snapshotContentUrl = await getSnapshotContentUrl(baseTreeId, setHash, isNsfwUnlocked, alignment);

if (snapshotContentUrl) {
  try {
    const snapshotData = await fetchContentJson(snapshotContentUrl);
    if (snapshotData?.nodes) {
      const finalTree = { rootId: snapshotData._meta?.startNodeId ?? baseTree.start_node_id, nodes: snapshotData.nodes };
      await setCache(versionedCacheKey, finalTree, CACHE_TTL_SECONDS);
      return finalTree;
    }
  } catch {
    // Fall through to live merge
  }
}

// 3. Fallback: original live merge path (unchanged)
```

## Migration Flow

1. Content migration runs under `content_migration` advisory lock
2. Per-entity content processing (existing)
3. Chunk compilation (`compileAllDialogueTrees`) (existing)
4. **NEW:** Snapshot compilation (`buildSnapshotsForAllTrees`) — runs after chunks
5. Cache invalidation (existing)

Snapshots are only rebuilt when:
- A new content migration runs (checksum change detected)
- A new mystery is added/removed (changes ACTIVE set)
- A dialogue tree or overlay is modified

## Invalidation

The existing `invalidatePattern('dialogue:resolved:*')` mechanism remains unchanged and correct:
- It clears the Redis read-through layer
- On next miss, the resolver checks for snapshots
- If snapshot exists → single MinIO GET + parse (fast path)
- If no snapshot → live merge (fallback, covers gap between migration and snapshot generation)

## Verification

### Unit Tests

Run the snapshot-specific unit tests:
```bash
npm run test:unit -- tests/unit/DialogueResolver.snapshot.unit.test.ts
```

Tests cover:
- Snapshot fast path on cache miss
- Fallback to live merge when no snapshot
- Fallback to live merge when snapshot fetch fails
- Redis cache hit skips snapshot path
- `buildSetHash` determinism

### Integration Tests

Run the integration test:
```bash
npm run test:integration -- tests/integration/m30.snapshots.test.ts
```

Tests cover:
- `buildSnapshotsForTree` generates snapshots
- All alignment/nsfw combinations are generated
- Snapshot pointers are persisted in `dialogue_chunks`
- Snapshot lookup works by state
- `DialogueResolver` uses snapshot fast path
- Fallback to live merge when no snapshot exists
- Idempotent rebuilds

### Full Test Suite

```bash
npm run lint --workspace=server
npm run build --workspace=server
npm run test --workspace=server
```

### Benchmark Verification

Re-run the S4 benchmark to verify p99 improvement:

```bash
cd server/scripts
BENCH_S4_SAMPLE=1 BENCH_SCENARIO=S4 BENCH_S4_SCALE=500 node m30_benchmark.ts
```

**Expected:** p99 < 250 ms at 500 distinct keys (vs ~560 ms baseline)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Snapshot content stale | Content-addressed keys + pointer-based versioning self-heal |
| MinIO unavailable during build | Best-effort publish; in-DB `nodes` column acts as fallback |
| MinIO unavailable at runtime | Fallback to live merge path |
| Snapshot missing for a state | Fallback to live merge path |
| Storage bloat | Snapshot count is bounded by combinatorial ceiling (~240 real regime) |
| Build time | Snapshots computed once per migration under advisory lock |

## Gate Parity

The snapshot compiler uses the **exact same gate and merge logic** as `DialogueResolver`:
- Same `deepMergeNodes` function
- Same NSFW entitlement check
- Same alignment gate (`loyalist_only` / `fugitive_only`)
- Deterministic overlay ordering (sorted by `mystery_id`)

This ensures snapshot content is byte-for-byte identical to what the live merge would produce.

## Open Questions (Resolved)

### 4.1a vs 4.1b

**Decision:** 4.1a (reuse `dialogue_chunks`)

**Rationale:**
- No schema migration needed
- Reuses existing CDN fetch infrastructure (`fetchChunkFromContentUrl` pattern)
- Consistent with M23 externalization approach
- Zero new tables, zero new read paths

### Reachable Alignments

**Decision:** Generate snapshots for all 3 alignments (`neutral`, `loyalist`, `fugitive`)

**Rationale:** All 3 are reachable in content (player can choose alignment via meta-plot).
The combinatorial ceiling remains manageable (2 nsfw × 3 alignment × 2^n mystery sets).

## Definition of Done

- [ ] Snapshot implementation and tests pass in the verification commands above.
- [ ] Server and intake-worker images are rebuilt and both in-container health checks
      return `{"success":true}`.
- [ ] S4 at scale 500 is re-run with snapshots present and distinct-key p99 is below
      the 250 ms target, or the measured result and explanation are recorded here.
- [ ] M30 Phase A is marked Shipped in this document and `docs/milestones/README.md`.

## Related Documents

- [Benchmark Results: `docs/milestones/M30-benchmark-results.md`](M30-benchmark-results.md)
- [Deferral Decision: `docs/milestones/M30-M31-deferred.md`](M30-M31-deferred.md)
- [Architecture Analysis: `docs/ARCHITECTURE_SEPARATION_ANALYSIS.md`](../ARCHITECTURE_SEPARATION_ANALYSIS.md)
