-- ============================================================
-- 089_content_plans_graph_revision.sql
--
-- Always-bumped amendment revision for content_plans.
--
-- GraphIntakeService.amendPlanWithInstruction commits the graph change and
-- refreshes intake annotations in TWO separate transactions. The refresh must
-- skip when a later amendment committed in between, or it retires the newer
-- amendment's open intake annotations with its own stale snapshot.
--
-- The previous guard compared `plan_json`, which is NOT monotonic: when an
-- amendment's synthesized snapshot fails schema validation the commit keeps
-- the old value (`plan_json = COALESCE($2, plan_json)`), so two consecutive
-- schema-invalid amendments leave `plan_json` unchanged and the stale refresh
-- slips through. `xmin` is monotonic but bumps on ANY column touch (status,
-- verification_report, updated_at), so it over-skips on touch-only updates.
--
-- `graph_revision` bumps ONLY on amendment commits (+1 per commit, even when
-- the snapshot was schema-invalid and `plan_json` was kept), so the refresh
-- guard can distinguish "graph moved on" (skip) from "unrelated column
-- touched" (proceed). No backfill needed: existing rows default to 0 and the
-- first amendment bumps them to 1.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes re-runs safe.
-- ============================================================

ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS graph_revision INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN content_plans.graph_revision IS
  'Monotonic amendment counter, bumped +1 by every GraphIntakeService amendment commit (even when the snapshot fails schema validation and plan_json is kept). The post-commit annotation refresh compares this — not plan_json or xmin — to detect a superseding amendment. Touch-only updates (status, verification_report) never bump it.';
