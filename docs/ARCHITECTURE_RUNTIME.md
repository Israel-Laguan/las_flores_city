# Runtime And Intake Architecture

This document is the durable architecture reference for the runtime separation and
authoring pipeline established during the former M19-M25 work. Milestone branch names,
PR sizing, and completion checklists are intentionally not part of this document.

## Process Boundaries

The repository has two server processes:

- `server/src/index.ts` is the game server on port `3000`. It serves player routes,
  `DialogueResolver`, leaderboard/relationship workers, and reads content tables.
- `server/src/intake.ts` is the intake worker on port `3001`. It owns migrations,
  content migration, admin/content-authoring routes, Story Builder orchestration, LLM
  work, and asset work.

The intake worker is the sole owner of `runAllMigrations()` and content-table mutation.
The game server never migrates. Admin server-side calls use `INTERNAL_SERVER_URL` to
reach the intake worker; browser calls use the host-facing intake URL.

Both processes use the shared `createApp(registerRoutes)` builder in
`server/src/app.ts`. Redis provides the existing fire-and-forget job handoff and
`content_plans.status` remains the polling/status contract; no second queue is required.

## Database And Content Reads

`@las-flores/infra` owns connection and Redis wiring. The sanctioned database pools are:

- `oltpPool` / `withOLTPTransaction` for all player reads and writes.
- Read-only `contentPool` / `queryContent` for content reads such as dialogue,
  overlays, chunks, scenes, characters, districts, and mysteries.
- `olapPool` / `queryOLAP` for analytics.

The content pool is read-only at the Postgres session level. Player writes must never use
it. Dialogue and location browsing reads use `queryContent`; player state remains on the
OLTP path.

## Dialogue Snapshot Runtime Contract

Pre-resolved dialogue snapshots are a bounded runtime optimization over the canonical
content-delivery path. During content migration, dialogue trees are compiled and their
base node maps are published as immutable, content-addressed MinIO/CDN JSON. The snapshot
pass then computes reachable mystery-set, NSFW-entitlement, and alignment combinations,
publishes each merged node map as another immutable blob, and persists the returned
`content_url` in `dialogue_chunks` under a deterministic `__snapshot_...` `chunk_key`.

The ordering is always:

```text
generate -> publish MinIO/CDN blob -> persist content_url pointer -> invalidate dialogue caches
```

`DialogueResolver` derives the state and content-version cache key, returns a Redis hit
when available, and otherwise looks up the snapshot pointer. A valid snapshot blob is
hydrated, cached, and returned. If a snapshot state has no pointer, or its blob is missing,
empty, or unreadable, the resolver performs the deterministic live base-plus-overlay merge
and caches that result instead. Snapshot generation and publication errors are therefore
non-fatal to migration; uncovered or failed states remain resolvable live.

Base trees and chunks are different from optional snapshot states: since M32 removed the
heavy dialogue JSONB columns, a base `content_url` is required. A missing or unreadable
base pointer is an error, not an in-database fallback. Republished content changes the
pointer-derived cache version, and migration also invalidates `dialogue:*` keys after
publication.

## Intake Safety

The intake boundary enforces “LLMs propose; the core system commits.”

- `POST /admin/story-builder/plans/:id/preview` is preview-only: outline and
  advisory conflict scan, with no scaffold or database insert. The plan itself
  is created by `POST /admin/story-builder/plans`.
- Authors explicitly commit through the scaffold endpoint or refine the in-memory
  preview.
- `ValidationHarnessService.runValidationHarness()` performs deterministic checks for
  timeline overlap, duplicate slug/name, foreign-key integrity, and ordering. Only
  error-severity findings block approval.
- `analyzeIntakeConflicts()` provides an advisory LLM conflict preview using existing
  content context. It does not replace deterministic approval validation.

Canon writes are migration-gated. `StoryBuilderPlanOps` is the pipeline writer and its
canon-writing operations must reach `migrateContent()` before content becomes authoritative.
`StoryBuilderLore`, `PromptFileGenerator`, and `LocalDraftService` are sidecar writers and
may use only the low-level atomic-write primitive for non-canon artifacts. The repository
writer guard (`scripts/check-story-builder-writer-guard.mjs`) keeps this importer registry
explicit and rejects unregistered writers or sidecars that use canon-writing methods.

## Durable Jobs

Background work is tracked in `job_runs`, one row per `(plan_id, job_type)` with
`attempt` incremented on the same row across retries (keyed by its `id` UUID; a
unique `(plan_id, job_type)` key is deliberately NOT used — see
`062_job_runs.sql`). A row records
status, attempt budget, retry time, current stage, committed stages, partial results, and
errors. Attempts increment on the same row.

When the intake worker starts, `markOrphanedResumable()` changes abandoned `running` jobs
to `resumable`. Solidify and asset jobs resume from persisted state. `committed_stages`
prevents duplicate commits; `migration_log` checksums make content migration idempotent;
chosen asset publishing updates the existing development URL entry in place.

`backoffDelayMs()` uses the asset-generation exponential backoff curve. The job-level
attempt budget is deliberately smaller than per-request LLM retries.

## Claims, Revisions, And Identity

Patch-level versioning makes rollback a lookup rather than inverse reasoning. Canon changes
are tied to revisions and applied patches. Claims and evidence are append-only and retain
source spans, confidence, status, and conflict reasons. The admin audit UI exposes revision
and claim provenance.

Entity identity is separate from entity existence. `IdentityResolver` returns an existing
stable ID or a new candidate and surfaces alternatives instead of silently choosing an
identity. Conflict detection is neighborhood-scoped and records the checked scope so the
system can state what it did and did not inspect.

## Operational Verification

Relevant current checks are:

```bash
npm run lint --workspace=server
npm run build --workspace=server
npm run validate:content
```

Snapshot lifecycle coverage is maintained by
`server/tests/integration/m30.snapshots.test.ts`,
`server/tests/unit/DialogueResolver.snapshot.unit.test.ts`, and the CDN contract tests
under `server/tests/integration/dialogue-cdn.integration.test.ts`.

For a running stack, verify both processes from inside their containers with `wget` on
ports `3000` and `3001`. Durable-job integration coverage lives under the current
`JobRunService` and job-runs test suites.
