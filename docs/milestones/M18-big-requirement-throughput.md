---
status: planned
goal: Make intake scale to large plans (10+ items, many assets) via in-process async approveAndSolidify with cache-backed status, scoped migrate, and LLM latency handling.
background: |
  - approveAndSolidify runs synchronously in one withOLTPTransaction; a large plan takes 30+ s (LLM + full-repo validate/migrate + MinIO publish).
  - The async-execution spike (docs/spikes/async-execution.md) recommends in-process async + cache status as the next step (AGENTS.md-compliant: uses existing setCache/getCache/deleteCache).
  - migrateContent re-globs entire content/ tree on every run; scoped migrate would skip unrelated files.
  - LiteLLMProvider has a single 60s timeout with no retry; large plans are the worst case.
scope:
  in:
    - Async solidify: approveAndSolidifyPlan becomes launcher; runSolidify runs outside tx with cache updates
    - New statuses: pending, staging, migrating, verifying, verified, failed (additive migration; preserve existing staged/migrated/verified/failed rows and CHECK constraint)
    - Status endpoint GET /admin/story-builder/plans/:id/status + UI polling in ResultsStep
    - Scoped migrateContent(contentDir, files?: string[]) - Story Builder passes staged file list
    - LLM latency: LiteLLMProvider accepts {timeoutMs, retries}; Story Builder raises timeout for large plans
    - Startup recovery: reset orphaned in-flight plans to failed on boot
  out:
    - External queue (BullMQ/streams) - needs AGENTS.md constraint lift
    - SSE - infra complexity
    - Horizontal scaling beyond single server
approach:
  - Async solidify: validate status, set pending, fire runSolidify(planId) outside tx with rejection handler that persists failed status and clears cache, return jobId
  - runSolidify updates setCache('story-builder:job:<planId>') at each stage
  - New migration (e.g. 052_content_plans_async.sql) adds new status values idempotently via additive CHECK (DROP TRIGGER IF EXISTS + ALTER TABLE ... ADD CONSTRAINT pattern)
  - Scoped migrate: skip full-tree checksum loop when file list provided
  - LLM latency: parameterized timeout/retry in LiteLLMProvider
risks:
  - In-process job lost on server restart - mitigation: startup reset to failed, re-triggerable
  - Status drift between cache and DB - mitigation: DB status is source of truth, cache is hot read path
files:
  - server/src/services/StoryBuilderOrchestrator.ts (async launcher + runSolidify)
  - server/src/routes/admin-story-builder-actions.ts (status endpoint)
  - server/src/database/migrations/052_content_plans_async.sql (new)
  - shared/src/schemas/story-builder.ts (status enum update)
  - server/src/content/migrate.ts (files param)
  - server/src/services/LiteLLMProvider.ts (timeout/retry opts)
  - admin/src/app/story-builder/components/ResultsStep.tsx (poll progress)
  - admin/src/app/story-builder/hooks/useStoryBuilderApi.ts (status polling)
verification:
  - Unit: cache updates per stage (mocked)
  - Integration: approve returns immediately, polls to verified (terminal state)
  - Integration: kill server mid-run → restart → orphaned pending reset to failed
  - Perf: 10-item/5-asset plan completes without timeout
dependencies:
  - M13 must ship first (async builds on corrected stage/migrate)
  - Existing cache layer (no new infra)