-- ============================================================
-- 086_content_plans_rejected.sql
--
-- Add a soft-terminal `rejected` status to content_plans for M50's
-- plan:reject CLI path (Part 2). Rejection is lenient-by-audit, not destructive:
-- the plan row (id + plan_json + created_by) is preserved so a declined
-- proposal stays reviewable, but its authoring-graph deltas are pruned and its
-- open intake annotations are marked `addressed`. Canonical content (planId IS
-- NULL nodes) is never touched — rejection only ever affects the plan's own
-- deltas/edges, so it is always safe and cheap.
--
-- `rejected` is intentionally absent from the materialize/approve state machine
-- (StoryBuilderOrchestrator) — only `proposed`/`approved`/`failed` may advance
-- to approval. A rejected plan can be re-opened only by an explicit admin action
-- (status flip), which is a future M52 concern, not this CLI's job.
--
-- Mirrors 055_content_plans_async.sql: DROP CONSTRAINT IF EXISTS + re-add, so the
-- file is idempotent and never invalidates existing rows (no backfill needed).
-- 085_critique_scope_intake_validate.sql already VALIDATEd the critique scope
-- CHECK; this migration only widens the content_plans status CHECK.
-- ============================================================

ALTER TABLE content_plans DROP CONSTRAINT IF EXISTS content_plans_status_check;

ALTER TABLE content_plans
  ADD CONSTRAINT content_plans_status_check
  CHECK (status IN (
    'draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed',
    'pending', 'staging', 'migrating', 'verifying', 'rejected'
  )) NOT VALID;

ALTER TABLE content_plans VALIDATE CONSTRAINT content_plans_status_check;

COMMENT ON CONSTRAINT content_plans_status_check IS
  'content_plans status enum — rejected is a soft terminal state preserved for audit (plan:reject), never advanced to materialize.';
