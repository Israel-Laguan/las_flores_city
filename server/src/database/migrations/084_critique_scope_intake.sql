-- ============================================================
-- 084_critique_scope_intake.sql
--
-- Fail-open plan intake: allow scope = 'intake' on critique_annotations.
--
-- Plan intake is lenient by contract — an ambiguous or unresolvable reference
-- attaches an advisory note and lets the plan through rather than aborting it.
-- Those notes are persisted as `type: 'suggestion'` critique annotations so the
-- existing comment/amend loop (ChatService.propose/applyDeltas scoped to one
-- annotationId, which auto-marks it 'addressed') can be reused as-is instead of
-- building a parallel comment system.
--
-- A DEDICATED scope is required, not optional. AICritiqueService.persistAnnotations
-- retires prior open annotations on every write with:
--     DELETE FROM critique_annotations WHERE plan_id = $1 AND scope = $2 AND status = 'open'
-- Reusing 'entity' would mean the next real critique pass silently wipes every
-- open intake note (and an intake run would wipe the critique's own findings).
-- Isolating intake notes under their own scope makes the two retire independently.
--
-- 070_critique_annotations.sql created the column with
--   CHECK (scope IN ('entity', 'cross_entity', 'cross_mission'))
-- so the constraint must be dropped and recreated to widen the allowed set.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + a re-added constraint of the same name
-- makes re-runs safe. Widening a CHECK never invalidates existing rows, so no
-- backfill or data migration is needed.
-- ============================================================

ALTER TABLE critique_annotations
  DROP CONSTRAINT IF EXISTS critique_annotations_scope_check;

ALTER TABLE critique_annotations
  ADD CONSTRAINT critique_annotations_scope_check
  CHECK (scope IN ('entity', 'cross_entity', 'cross_mission', 'intake')) NOT VALID;

COMMENT ON COLUMN critique_annotations.scope IS
  'Which pass produced the annotation: entity | cross_entity | cross_mission (LLM critique passes), or intake (fail-open plan-intake diagnostic note).';
