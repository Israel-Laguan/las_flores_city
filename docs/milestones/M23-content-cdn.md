# M23 — Content Externalization Phase 1 (Chunks + Dialogues → CDN)

> **Status:** Implemented · **Branch:** `milestone/23-content-cdn` · **PR size target:** ~25 files
> **Phase:** 4 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §6

## Goal

Move heavy content blobs (dialogue chunks + dialogue tree nodes) to MinIO/CDN, slim DB
rows to references, and keep the overlay merge in Redis (Phase 1). The big CDN read win:
OLTP content reads drop to ~zero on the hot path.

## Scope

| Item | Detail |
|---|---|
| **Publish chunks + tree nodes** | `content_url → s3://las-flores/chunks/<tree>/<key>__<hash>.json` and `s3://las-flores/dialogues/<treeId>__<hash>.json` |
| **Dual-write DB rows** | `dialogue_chunks` / `dialogue_trees` keep `id, tree_id, chunk_key, content_url` **and** the existing `nodes`/`leaves` JSONB columns for Phase 1 fallback |
| **`DialogueResolver` CDN fetch** | GET by `content_url`; merge base + overlays in Redis-cached memory (Phase 1) |
| **Cache-invalidation ordering** | publish MinIO → update DB pointer → `invalidatePattern('dialogue:resolved:*')` |
| **Content-addressed keys** | `<scope>/<id>__<hash>.json` where the hash is a SHA-256 of the serialized blob |
| **Cache key versioning** | Resolver cache keys include `:content:<ver>` derived from `content_url`; a republished blob changes the pointer → fresh key even if pattern invalidation didn't fire |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Publish/bake | `server/src/services/ContentPublishService.ts`, `StorageService.ts` |
| Content engine | `server/src/content/migrate.ts`, `compiler.ts` |
| Read path | `server/src/services/DialogueResolver.ts` (+ CDN fetch helper) |
| Migrations | `server/src/database/migrations/063_content_url.sql` |
| Connection | Reuse `oltpPool` / `withOLTPTransaction` (M19 explicitly added a read-only `contentPool`/`queryContent` for content reads, which is the sanctioned exception to the no-new-pools rule) |
| Tests | `server/tests/integration/dialogue-cdn.integration.test.ts`, updated `server/tests/integration/dialogue-resolver.test.ts` |

## Phase 1 dual-write / fallback decision

The milestone spec originally called for "slim DB rows" with the heavy JSONB columns dropped.
During implementation we kept the `dialogue_chunks.nodes`/`leaves` and `dialogue_trees.nodes`
columns and adopted a **publish-first, dual-write, fallback-enabled** strategy instead:

1. **`compiler.ts` publishes first**, then writes `content_url` pointers. If MinIO is unavailable,
   publishing is best-effort (`safePublish` wrapper) and the row is still written with
   `content_url = NULL`.
2. **`DialogueResolver` reads CDN first** (`fetchNodesFromContentUrl`) and falls back to the
   in-DB JSONB when `content_url` is NULL/empty or the CDN fetch fails.
3. **JSONB columns are intentionally retained** so existing tests, seed scripts, and admin/debug
   tooling that read/write `nodes`/`leaves` continue to work, and production can survive a CDN
   outage without losing dialogue resolution.

This is a deliberate **drift from the original spec** (which envisioned immediate column drops).
Physical removal of the JSONB columns is now **Phase 2** work, gated on operational confidence
and a migration that backfills or verifies every row has a reachable `content_url`.

### Phase 2 column-drop caveat (must fix before M32 drops the JSONB)

> Tracked in `M32-retirement.md:45`, but the concrete fix is a **precondition** here, not
> just a ledger line.

`DialogueResolver.loadBaseChunk`/`loadBaseChunkByKey` (`server/src/services/DialogueResolver.ts`)

already hydrate **both** `nodes` and `leaves` from the CDN blob via `fetchChunkFromContentUrl`
(`server/src/services/contentFetch.ts`), which returns the full `{ nodes, leaves }` shape.

**Phase 2 column-drop (completed in M32):** Commit `5443b007` dropped the `dialogue_trees.nodes`
and `dialogue_chunks.nodes`/`leaves` JSONB columns via migration `076_drop_dialogue_jsonb.sql`.
There is **no longer any in-DB JSONB fallback** — `DialogueResolver.loadBaseTree`/`loadBaseChunk`
throw on a NULL `content_url` and read the node/leaf maps exclusively from the CDN. This is the
state the original Phase 2 caveat was gating on, and it is now shipped. The dual-write/fallback
strategy described in "Phase 1 dual-write / fallback decision" therefore only applied during the
Phase 1 → M32 transition; from M32 onward the columns no longer exist.

**Unit-test impact of the M32 column drop:** dialogue unit tests can no longer return
`nodes`/`leaves` in the DB row. They must (a) return a `content_url` pointer and (b) stub
`server/src/services/contentFetch.js` (`fetchNodesFromContentUrl` / `fetchChunkFromContentUrl`)
to supply the node/leaf map. The same contract applies to admin routes `admin-list-views`
(`/dialogues` `nodeCount`) and `admin-story-beats` (`/:slug/usages`). See AGENTS.md Mocking
Rule 7b for the canonical pattern.

## Risks & verification

- **Risk:** Medium. Cache-invalidation timing (publish-first ordering) and versioned keys
  must be correct or CDN serves stale. Overlay merge stays in Redis for Phase 1, so resolve
  logic behavior is unchanged.
- **Verify:** migrate a dialogue, confirm chunks are CDN-addressable and resolvable; force
  a cache invalidation and confirm the new blob is served.
- **Accept:** no player-visible change; content reads no longer hit OLTP on the hot path.

## Definition of Done

- [x] Chunks + tree nodes published to MinIO; DB rows reference via `content_url` (JSONB retained for fallback during Phase 1)
- [x] `DialogueResolver` fetches from CDN and merges overlays in Redis (Phase 1)
- [x] Publish-first invalidation ordering correct; content-addressed keys in use; resolver cache keys include content-version token
- [x] Full dialogue resolution works end-to-end (unit + integration)

## Verification log

Verified on the local Podman stack (OLTP + Redis + MinIO):

- **Migration:** `063_content_url.sql` applied idempotently to OLTP.
- **DB pointers:** `dialogue_trees` 48/48 and `dialogue_chunks` 323/323 rows carry a
  non-NULL `content_url` after migration (`SELECT count(content_url) …`).
- **Live CDN round trip:** publish → `s3://las-flores/dialogues/<id>__<sha256>.json`,
  fetched back and JSON-parsed with `Content-Type: application/json`; changed content
  yields a different hash/key (content-addressing confirmed). Real bucket already holds
  ~50 content-addressed dialogue blobs from actual migration runs.
- **Tests:** `dialogue-cdn.integration.test.ts` + `dialogue-resolver.test.ts` pass;
  full integration suite + unit/smoke suite green via `npx --no-install jest tests/unit tests/smoke --no-cache --forceExit`.
- **Lint/build:** server lint 0 errors; `tsc` build clean.