# Authoring Retirement And Content Delivery

This document is the durable reference for the retirement and consolidation work formerly
recorded in M23 and M32. It describes the current contracts, not the historical PR ledger.

## CDN Content Contract

Dialogue trees and chunks are published as content-addressed MinIO/CDN JSON blobs. Database
rows retain identity and `content_url` pointers; the heavy dialogue node/leaf maps are not
stored in the retired JSONB columns.

The runtime lifecycle and fallback boundaries are defined authoritatively in the
`Dialogue Snapshot Runtime Contract` section of `docs/ARCHITECTURE_RUNTIME.md`. The
delivery-specific publication order is:

```text
publish MinIO -> update database pointer -> invalidate dialogue cache keys
```

Cache keys include a content-version token derived from `content_url`, so republishing a
blob produces a fresh version even if invalidation is missed.

`DialogueResolver` hydrates base trees and chunks exclusively through the CDN content-fetch
helpers. A missing `content_url` is an error. Unit tests must provide a content URL and mock
the content-fetch module; integrations publish real content URLs.

Dialogue overlays remain in the database because they are not externalized.

Pre-resolved dialogue states reuse `dialogue_chunks` as pointer rows. During content
migration, the intake worker computes bounded combinations of sorted mystery sets, NSFW
entitlement, and alignment, publishes each merged node map as a content-addressed MinIO
object, and stores the object URL under a synthetic snapshot `chunk_key`. The resolver
checks this pointer after a Redis miss and hydrates the single object before caching the
resolved tree. States without a snapshot pointer, or whose snapshot blob cannot be read,
use the live base-plus-overlay merge path. Base tree and chunk content itself requires a
valid `content_url` after M32 removed the old JSONB payloads; it does not have an in-DB
fallback. Publishing follows the same MinIO -> pointer update -> cache invalidation and
pointer-versioning contract as other CDN content.

## Pin, Prove, Prune

The authoring system retires legacy paths only after classifying every candidate:

- **Retire:** only used by the superseded authoring path.
- **Refactor-Reuse:** still needed by graph export or materialization.
- **Keep:** used by the game hot path or current runtime.

Retired surfaces include the old async fill/placeholder pipeline, legacy outline and
single-turn refine methods, outline chunking, template/clone routes, and the old dialogue
JSONB columns. Their replacement is graph intake plus `MODIFY` deltas.

Retained surfaces include:

- `stagePlan`, `applyLink`, `migrateContent`, and `verifyPlan`.
- `ContentSkeletonGenerator` path/file helpers used by materialization.
- `ContentPlanService` validation/fallback methods still used internally.
- `StoryBuilderValidation` for the kept materializer.
- `dialogue_overlays.nodes` for current overlay merging.
- `plan_json` as GraphExporter transport only.

The current fill behavior is inlined in `StoryBuilderPlanOps.ts`; retired service names
must not be used as live imports or current ownership references.

## Coverage And Safety Gates

Before destructive schema retirement, the content URL coverage probe must verify every
dialogue tree/chunk is reachable. The current migration is
`server/src/database/migrations/076_drop_dialogue_jsonb.sql`.

Retirement verification consists of:

- Full server build and relevant unit/integration tests.
- `npm run validate:content`.
- Content URL coverage probe with zero unreachable rows.
- In-container health checks for both game and intake workers.
- Repository search confirming no live imports of retired services, routes, or methods.

## Ownership

Prompt, portrait-expression, and scene-background conventions live in
`docs/ASSET_EXPRESSION_VOCABULARY.md` and `docs/VARIANT_GENERATION_RUNBOOK.md`. Completed
milestone records are not current ownership documents and must not be recreated as
independent backlogs.
