-- ============================================================
-- 085_critique_scope_intake_validate.sql
--
-- M50 (follow-up): Validate the widened critique_annotations scope CHECK
-- previously added with NOT VALID in 084. 084 deliberately skipped the
-- row-scan validation so intake/critique writes are never blocked while
-- the table is locked. This migration performs that scan off the hot path.
-- Idempotent: re-validating an already-validated constraint is a no-op.
-- ============================================================

ALTER TABLE critique_annotations VALIDATE CONSTRAINT critique_annotations_scope_check;
