# M23 — Content Externalization Phase 1 (Chunks + Dialogues → CDN)

> **Status:** Planned · **Branch:** `milestone/23-content-cdn` · **PR size target:** ~25 files
> **Phase:** 4 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §6

## Goal

Move heavy content blobs (dialogue chunks + dialogue tree nodes) to MinIO/CDN, slim DB
rows to references, and keep the overlay merge in Redis (Phase 1). The big CDN read win:
OLTP content reads drop to ~zero on the hot path.

## Scope

| Item | Detail |
|---|---|
| **Publish chunks + tree nodes** | `content_url → s3://las-flores/chunks/<tree>/<key>.json` |
| **Slim DB rows** | `dialogue_chunks` / `dialogue_trees` keep `id, tree_id, chunk_key, content_url`; heavy JSONB dropped |
| **`DialogueResolver` CDN fetch** | GET by `content_url`; merge base + overlays in Redis-cached memory (Phase 1) |
| **Cache-invalidation ordering** | publish MinIO → update DB pointer → `invalidatePattern('dialogue:resolved:*')` |
| **Content-addressed keys** | `<slug>__<hash>.json` using `migration_log` checksum as the version key |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Publish/bake | `server/src/services/AssetPublishService.ts`, `ServerStorage.ts` |
| Content engine | `server/src/content/migrate.ts`, `compiler.ts` |
| Read path | `server/src/services/DialogueResolver.ts` (+ CDN fetch helper) |
| Migrations | `dialogue_chunks` / `dialogue_trees` schema changes |
| Connection | `server/src/database/connection.ts` (content pool from M19) |
| Tests | integration for CDN-fetch + merge; invalidation ordering |

## Risks & verification

- **Risk:** Medium. Cache-invalidation timing (publish-first ordering) and versioned keys
  must be correct or CDN serves stale. Overlay merge stays in Redis for Phase 1, so resolve
  logic behavior is unchanged.
- **Verify:** migrate a dialogue, confirm chunks are CDN-addressable and resolvable; force
  a cache invalidation and confirm the new blob is served.
- **Accept:** no player-visible change; content reads no longer hit OLTP on the hot path.

## Definition of Done

- [ ] Chunks + tree nodes published to MinIO; DB rows slimmed to references
- [ ] `DialogueResolver` fetches from CDN and merges overlays in Redis (Phase 1)
- [ ] Publish-first invalidation ordering correct; content-addressed keys in use
- [ ] Full dialogue resolution works end-to-end (unit + integration)