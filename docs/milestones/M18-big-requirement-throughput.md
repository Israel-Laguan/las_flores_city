---
status: planned
goal: Make intake scale to large plans (10+ items, many assets) via git-tracked text + idempotent cron-driven image generation.
background: |
  - Author edits YAML/MD drafts in `content/`, tracked by git. Local image drafts are gitignored.
  - Image generation (LLM + storage) is the only long-running step; it runs in a cron worker like LeaderboardWorker.
  - `plan_json` in `content_plans` is the durable substrate: asset-need status lives inside it, so restarts can resume.
  - Text interruption = regen from `plan_json` (deterministic) or `git checkout` (if hand-edited). No partial state risk.
  - Final-approve (publish to MinIO + migrate to DB) is a single atomic transaction; interruption reverts via Postgres rollback.
scope:
  in:
    - Image generation worker: `ContentAssetWorker` cron processes `verified` plans, generates missing drafts per asset need
    - AssetNeed statuses: `pending`→`generating`→`drafted`/`chosen`→`published` (or `failed` on retry exhaustion)
    - Idempotent draft gen: skip existing drafts; use advisory lock / status claim to prevent double-generation
    - Staleness reclaim: `generating` needs with `updated_at < NOW() - 5min` reset to `pending` on tick
    - scoped migrateContent(contentDir, files?) - Story Builder passes staged file list (perf)
    - LLM latency: LiteLLMProvider accepts {timeoutMs, retries}; Story Builder raises timeout for large plans
    - Double-confirm modal in admin for final-approve (the one durable action that makes content live in game)
  out:
    - Fire-and-forget async with cache-status polling (eliminated: plan_json in OLTP already stores progress)
    - New migration for status CHECK (eliminated: status lives in plan_json.assetNeeds[].status, not content_plans.status)
    - External queue (BullMQ/streams) - no need; cron + plan_json is already durable
    - SSE - infra complexity not required
approach:
  - Image gen runs in `ContentAssetWorker` cron (setInterval in index.ts, same pattern as LeaderboardWorker)
  - Each tick scans `content_plans WHERE status = 'verified' AND assetNeeds contains 'pending'`
  - Per-need: claim via advisory lock + flip status to `generating`, skip if draft exists, else fire image gen
  - On draft save: `markDrafted(need)` + persist `plan_json`; on publish: `markPublished(need)` + persist
  - Startup reconciliation resets `generating`→`pending` before first tick (in initializeServer)
  - Final-approve calls `publishChosenDrafts` + `migrateContent` inside one `withOLTPTransaction` (atomic)
  - Scoped migrateContent skips unrelated files; LLMProvider timeout/retry handles latency
risks:
  - Drafts not regenerated after hard-kill — mitigated: next tick re-fires all `pending` needs; drafts are deterministic
  - Orphaned partial drafts on disk — mitigated: scoped migrate ignores non-staged files; user can delete staging dir
  - Image-gen hang (stuck in `generating`) — mitigated: staleness query resets to `pending` after 5 min
files:
  - server/src/workers/ContentAssetWorker.ts (new)
  - server/src/index.ts (cron registration + startup reconciliation)
  - server/src/services/AssetNeedsService.ts (add `generating` status + transition)
  - shared/src/schemas/story-builder.ts (extend AssetNeedSchema status enum if needed)
  - server/src/content/migrate.ts (files param for scoped migration)
  - server/src/services/LiteLLMProvider.ts (timeout/retry opts)
  - admin/src/app/story-builder/components/FinalApproveModal.tsx (new)
  - admin/src/app/story-builder/hooks/useAssetGeneration.ts (poll plan_json for need statuses)
verification:
  - Unit: ContentAssetWorker.tick processes verified plans, skips existing drafts, resets stalled generating
  - Integration: kill server mid-gen → restart → worker tick reclaims and resumes
  - Integration: hand-edit YAML → approve → conflict loop → image gen → final-approve succeeds
  - Perf: 10-item/5-asset plan image gen completes without timeout
dependencies:
  - M13 must ship first (async builds on corrected stage/migrate)
  - Existing cache layer (no new infra)